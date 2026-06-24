import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { signWebhook } from "@xgamefi/shared/hmac";
import { safeFetch } from "@xgamefi/shared/ssrf";
import { toOrderDto, type OrderRow } from "@xgamefi/shared/dto";
import { getQueue } from "@xgamefi/shared/queues";

export type WebhookDeliveryJobData = { orderId: string };

function eventName(event: "purchase_completed" | "purchase_pending" | "purchase_failed"): string {
  return event.replace(/_/g, ".");
}

export async function webhookDeliveryProcessor(job: { data: WebhookDeliveryJobData }): Promise<{ status: string }> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { studio: true, item: true } });
  if (!order) throw new Error(`webhook-delivery: order ${orderId} not found`);
  if (order.paymentStatus !== "PAID") throw new Error(`webhook-delivery: order ${orderId} is not PAID`);
  if (!order.studio?.webhookUrl) throw new Error(`webhook-delivery: studio ${order.studioId} has no webhookUrl`);
  const studio = order.studio;

  const event: "purchase_completed" = "purchase_completed";
  const payload = { event: eventName(event), order: toOrderDto(order as unknown as OrderRow) };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(studio.webhookSecretHash ?? "", timestamp, rawBody);

  const delivery = await prisma.webhookDelivery.create({
    data: {
      studioId: studio.id,
      event,
      orderId: order.id,
      url: order.studio.webhookUrl,
      payload,
      signature,
      attempt: 0,
      maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
      status: "PENDING",
    },
  });

  let responseStatus: number | null = null;
  try {
    const res = await safeFetch(order.studio.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XGameFi-Signature": signature,
        "X-XGameFi-Timestamp": String(timestamp),
      },
      body: rawBody,
      timeoutMs: 10_000,
      maxBytes: 1_000_000,
    });
    responseStatus = res.status;
    if (res.ok) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "DELIVERED", responseStatus, deliveredAt: new Date() },
        }),
        prisma.order.update({ where: { id: order.id }, data: { deliveryStatus: "DELIVERED", deliveredAt: new Date() } }),
      ]);
      return { status: "DELIVERED" };
    }
  } catch (err) {
    console.error(`webhook-delivery: network error for order ${orderId}`, err);
  }

  const nextAttempt = delivery.attempt + 1;
  const isExhausted = nextAttempt >= delivery.maxAttempts;

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempt: nextAttempt,
      responseStatus,
      status: isExhausted ? "EXHAUSTED" : "FAILED",
      nextAttemptAt: isExhausted ? null : new Date(Date.now() + Math.min(2 ** nextAttempt * 1000, 60_000)),
    },
  });

  if (isExhausted) {
    await prisma.order.update({ where: { id: order.id }, data: { deliveryStatus: "FAILED" } });
    await getQueue("refund").add("refund", { orderId: order.id }, { jobId: `refund-${order.id}` });
    return { status: "EXHAUSTED" };
  }

  throw new Error(`webhook-delivery failed with status ${responseStatus ?? "network"}; attempt ${nextAttempt}`);
}
