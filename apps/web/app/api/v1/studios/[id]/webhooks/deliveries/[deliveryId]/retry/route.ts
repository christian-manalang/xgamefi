import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { getQueue, toWebhookDeliveryDto, writeAudit } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; deliveryId: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id, deliveryId } = await params;
    const principal = await requireStudio(id);
    const existing = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, studioId: id },
    });
    if (!existing) throw new HttpError(404, "delivery not found");
    if (existing.status === "DELIVERED") throw new HttpError(409, "already delivered");

    const updated = await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PENDING",
        attempt: 0,
        nextAttemptAt: new Date(),
        responseStatus: null,
      },
    });
    await getQueue("webhook-delivery").add("deliver", { deliveryId });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "webhook.retry",
      entityType: "WebhookDelivery",
      entityId: deliveryId,
      metadata: { studioId: id },
      ip: getClientIp(req),
    });
    return Response.json({ data: toWebhookDeliveryDto(updated) }, { status: 202 });
  } catch (e) {
    return handleError(e);
  }
}
