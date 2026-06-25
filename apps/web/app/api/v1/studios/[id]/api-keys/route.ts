import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { generateApiKey, toApiKeyDto, writeAudit, IssueApiKeyInput } from "@xgamefi/shared";
import { handleError, getClientIp } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const input = IssueApiKeyInput.parse(await req.json().catch(() => ({})));
    const { raw, prefix, hashedKey } = generateApiKey();
    const row = await prisma.apiKey.create({
      data: { studioId: id, keyPrefix: prefix, hashedKey, scopes: input.scopes },
    });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "apikey.issue",
      entityType: "ApiKey",
      entityId: row.id,
      metadata: { studioId: id, keyPrefix: prefix },
      ip: getClientIp(req),
    });
    return Response.json({ data: { ...toApiKeyDto(row), key: raw } }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
