import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { assertPublicUrl, generateWebhookSecret, writeAudit, WebhookConfigInput } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const { url } = WebhookConfigInput.parse(await req.json());
    try {
      await assertPublicUrl(url);
    } catch {
      throw new HttpError(400, "webhook URL failed SSRF validation");
    }
    const secret = generateWebhookSecret();
    const updated = await prisma.studio.update({
      where: { id },
      data: { webhookUrl: url, webhookSecretHash: secret.hash },
    });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "webhook.config",
      entityType: "Studio",
      entityId: id,
      metadata: { rotatedSecret: true },
      ip: getClientIp(req),
    });
    return Response.json({ data: { webhookUrl: updated.webhookUrl, secret: secret.raw } });
  } catch (e) {
    return handleError(e);
  }
}
