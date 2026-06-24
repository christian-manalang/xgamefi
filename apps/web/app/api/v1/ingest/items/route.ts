import { createHash } from "node:crypto";
import { prisma } from "@xgamefi/db";
import { upsertCatalogueItems } from "@xgamefi/shared";
import { RemoteItemsSchema } from "@xgamefi/shared/zod/catalogue";
import { authenticateIngest, IngestAuthError } from "../../../../../lib/ingest-auth";

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  let auth: { studioId: string; apiKeyId: string };
  try {
    auth = await authenticateIngest(req.headers, rawBody);
  } catch (err) {
    const status = err instanceof IngestAuthError ? err.status : 401;
    return Response.json({ error: "unauthorized" }, { status });
  }

  const parsed = RemoteItemsSchema.safeParse(safeJson(rawBody));
  if (!parsed.success) {
    return Response.json({ error: "invalid items payload" }, { status: 400 });
  }

  const idemKey = req.headers.get("idempotency-key");
  const requestHash = createHash("sha256").update(rawBody).digest("hex");
  const scope = "ingest:items";

  if (idemKey) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
    if (existing) {
      return Response.json(existing.responseSnapshot, { status: 200 });
    }
  }

  const result = await upsertCatalogueItems(auth.studioId, parsed.data);

  if (idemKey) {
    await prisma.idempotencyKey.create({
      data: { key: idemKey, scope, requestHash, responseSnapshot: result },
    });
  }

  return Response.json(result, { status: 200 });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
