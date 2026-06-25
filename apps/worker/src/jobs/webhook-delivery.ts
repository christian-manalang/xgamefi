import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { signWebhook } from "@xgamefi/shared/hmac";
import { safeFetch } from "@xgamefi/shared/ssrf";
import { toOrderDto, toP2PTradeDto, type OrderRow } from "@xgamefi/shared/dto";
import { getQueue } from "@xgamefi/shared/queues";
import { publishOrderEvent } from "@xgamefi/shared/order-events";

async function deliverWebhook(
  url: string,
  init: RequestInit & { timeoutMs?: number; maxBytes?: number },
): Promise<Response> {
  const isTestLocalhost = env.NODE_ENV === "test" && url.startsWith("http://localhost");
  if (isTestLocalhost) {
    const { timeoutMs = 5000, ...fetchInit } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...fetchInit, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  return safeFetch(url, init);
}

export type WebhookDeliveryJobData = { orderId?: string; tradeId?: string; event?: string };

type WebhookEventName = "purchase_completed" | "purchase_pending" | "purchase_failed" | "p2p_trade_completed";

function eventName(event: WebhookEventName): string {
  return event.replace(/_/g, ".");
}

export async function webhookDeliveryProcessor(job: { data: WebhookDeliveryJobData }): Promise<{ status: string }> {
  let studioId: string;
  let webhookUrl: string;
  let webhookSecretHash: string;
  let event: WebhookEventName;
  let payload: Prisma.InputJsonValue;
  let linkOrderId: string | undefined;
  let linkTradeId: string | undefined;

  if (job.data.tradeId) {
    const trade = await prisma.p2PTrade.findUnique({
      where: { id: job.data.tradeId },
      include: { listing: { include: { item: { include: { studio: true } } } } },
    });
    if (!trade) throw new Error(`webhook-delivery: trade ${job.data.tradeId} not found`);
    const studio = trade.listing.item.studio;
    if (!studio?.webhookUrl) throw new Error(`webhook-delivery: studio ${studio?.id} has no webhookUrl`);
    studioId = studio.id;
    webhookUrl = studio.webhookUrl;
    webhookSecretHash = studio.webhookSecretHash ?? "";
    event = "p2p_trade_completed";
    payload = { event: eventName(event), trade: toP2PTradeDto(trade) };
    linkTradeId = trade.id;
  } else {
    const orderId = job.data.orderId;
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { studio: true, item: true } });
    if (!order) throw new Error(`webhook-delivery: order ${orderId} not found`);
    if (order.paymentStatus !== "PAID") throw new Error(`webhook-delivery: order ${orderId} is not PAID`);
    if (!order.studio?.webhookUrl) throw new Error(`webhook-delivery: studio ${order.studioId} has no webhookUrl`);
    studioId = order.studio.id;
    webhookUrl = order.studio.webhookUrl;
    webhookSecretHash = order.studio.webhookSecretHash ?? "";
    event = "purchase_completed";
    payload = { event: eventName(event), order: toOrderDto(order as unknown as OrderRow) };
    linkOrderId = order.id;
  }

  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(webhookSecretHash, timestamp, rawBody);

  const delivery = await prisma.webhookDelivery.create({
    data: {
      studioId,
      event,
      orderId: linkOrderId,
      tradeId: linkTradeId,
      url: webhookUrl,
      payload,
      signature,
      attempt: 0,
      maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
      status: "PENDING",
    },
  });

  let responseStatus: number | null = null;
  try {
    const res = await deliverWebhook(webhookUrl, {
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
      const ops: unknown[] = [
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "DELIVERED", responseStatus, deliveredAt: new Date() },
        }),
      ];
      if (linkOrderId) {
        ops.push(prisma.order.update({ where: { id: linkOrderId }, data: { deliveryStatus: "DELIVERED", deliveredAt: new Date() } }));
      }
      await prisma.$transaction(ops as never);
      if (linkOrderId) {
        await publishOrderEvent(linkOrderId, { deliveryStatus: "DELIVERED" }).catch((err: unknown) =>
          console.error(`webhook-delivery: failed to publish event for ${linkOrderId}`, err),
        );
      }
      return { status: "DELIVERED" };
    }
  } catch (err) {
    console.error(`webhook-delivery: network error for ${linkTradeId ?? linkOrderId}`, err);
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
    // Order webhooks that exhaust trigger a buyer refund; P2P trades have already settled and paid out.
    if (linkOrderId) {
      await prisma.order.update({ where: { id: linkOrderId }, data: { deliveryStatus: "FAILED" } });
      await getQueue("refund").add("refund", { orderId: linkOrderId }, { jobId: `refund-${linkOrderId}` });
    }
    return { status: "EXHAUSTED" };
  }

  throw new Error(`webhook-delivery failed with status ${responseStatus ?? "network"}; attempt ${nextAttempt}`);
}
