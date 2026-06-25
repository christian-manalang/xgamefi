import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { toApiKeyDto, writeAudit } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; keyId: string }> };

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id, keyId } = await params;
    const principal = await requireStudio(id);
    const existing = await prisma.apiKey.findFirst({ where: { id: keyId, studioId: id } });
    if (!existing) throw new HttpError(404, "api key not found");
    const row = await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "apikey.revoke",
      entityType: "ApiKey",
      entityId: keyId,
      metadata: { studioId: id },
      ip: getClientIp(req),
    });
    return Response.json({ data: toApiKeyDto(row) });
  } catch (e) {
    return handleError(e);
  }
}
