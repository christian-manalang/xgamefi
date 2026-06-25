import { requireStudio } from "@/lib/auth";
import { prisma, WebhookEvent } from "@xgamefi/db";
import { getQueue, toWebhookDeliveryDto, writeAudit, WebhookTestInput } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const EVENT_MAP: Record<string, WebhookEvent> = {
  "purchase.completed": "purchase_completed",
  "purchase.pending": "purchase_pending",
  "purchase.failed": "purchase_failed",
  "p2p.trade.completed": "p2p_trade_completed",
};

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const { event } = WebhookTestInput.parse(await req.json().catch(() => ({})));
    const prismaEvent = EVENT_MAP[event];
    if (!prismaEvent) throw new HttpError(400, "unsupported event");
    const studio = await prisma.studio.findUnique({ where: { id } });
    if (!studio?.webhookUrl) throw new HttpError(409, "studio has no webhook URL configured");

    const payload = {
      id: `evt_test_${Date.now()}`,
      event,
      createdAt: new Date().toISOString(),
      data: { test: true, studioId: id },
    };
    const created = await prisma.webhookDelivery.create({
      data: {
        studioId: id,
        event: prismaEvent,
        url: studio.webhookUrl,
        payload,
        signature: "",
        attempt: 0,
        maxAttempts: 1,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
    });
    await getQueue("webhook-delivery").add("deliver", { deliveryId: created.id });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "webhook.test",
      entityType: "WebhookDelivery",
      entityId: created.id,
      metadata: { studioId: id, event },
      ip: getClientIp(req),
    });
    return Response.json({ data: toWebhookDeliveryDto(created) }, { status: 202 });
  } catch (e) {
    return handleError(e);
  }
}
