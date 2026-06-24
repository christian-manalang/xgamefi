import { createHash } from "node:crypto";
import { prisma } from "@xgamefi/db";
import { verifyHmac } from "@xgamefi/shared/hmac";
import { env } from "@xgamefi/config/env";

export class IngestAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "IngestAuthError";
  }
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function authenticateIngest(
  headers: Headers,
  rawBody: string,
): Promise<{ studioId: string; apiKeyId: string }> {
  const presentedKey = headers.get("x-xgamefi-key");
  const signature = headers.get("x-xgamefi-signature");
  const timestamp = headers.get("x-xgamefi-timestamp");
  if (!presentedKey || !signature || !timestamp) {
    throw new IngestAuthError("missing auth headers");
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: { hashedKey: hashKey(presentedKey), revokedAt: null },
  });
  if (!apiKey) throw new IngestAuthError("invalid api key");

  const ok = verifyHmac({
    secret: presentedKey,
    header: signature,
    rawBody: `${timestamp}.${rawBody}`,
    toleranceSec: env.WEBHOOK_TIMESTAMP_TOLERANCE_SEC,
  });
  if (!ok) throw new IngestAuthError("invalid signature");

  return { studioId: apiKey.studioId, apiKeyId: apiKey.id };
}
