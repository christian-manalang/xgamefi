import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { signWebhook } from "./hmac";
import { toOrderDto, type OrderRow } from "./dto";
import { publishOrderEvent } from "./order-events";

const MOCK_GAME_WEBHOOK_PATH = "/api/mock-game/webhook";

function resolveMockGameWebhookUrl(storedUrl: string): string {
  // Match the worker's rewrite logic: mock-game webhooks are part of the
  // platform, so deliver to the current APP_BASE_URL origin.
  if (storedUrl.endsWith(MOCK_GAME_WEBHOOK_PATH)) {
    const base = env.APP_BASE_URL.replace(/\/$/, "");
    return `${base}${MOCK_GAME_WEBHOOK_PATH}`;
  }
  return storedUrl;
}

export function isMockGameWebhook(url: string): boolean {
  return url.endsWith(MOCK_GAME_WEBHOOK_PATH);
}

export async function deliverMockGameWebhook(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { studio: true, item: true },
  });
  if (!order) {
    console.warn(`mock-webhook-fallback: order ${orderId} not found`);
    return false;
  }
  if (order.paymentStatus !== "PAID") {
    console.warn(`mock-webhook-fallback: order ${orderId} is not PAID`);
    return false;
  }
  if (!order.studio?.webhookUrl || !isMockGameWebhook(order.studio.webhookUrl)) {
    return false;
  }
  if (order.deliveryStatus === "DELIVERED") {
    return true;
  }

  const webhookUrl = resolveMockGameWebhookUrl(order.studio.webhookUrl);
  const webhookSecretHash = order.studio.webhookSecretHash ?? "";
  const payload = { event: "purchase.completed", order: toOrderDto(order as unknown as OrderRow) };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(webhookSecretHash, timestamp, rawBody);

  console.log(`mock-webhook-fallback: delivering to ${webhookUrl} for order ${orderId}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let responseStatus: number | null = null;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XGameFi-Signature": signature,
        "X-XGameFi-Timestamp": String(timestamp),
      },
      body: rawBody,
      signal: controller.signal,
    });
    responseStatus = res.status;
    if (!res.ok) {
      console.error(`mock-webhook-fallback: ${responseStatus} for order ${orderId}`);
      return false;
    }
  } catch (err) {
    console.error(`mock-webhook-fallback: network error for order ${orderId}`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }

  await prisma.$transaction([
    prisma.webhookDelivery.create({
      data: {
        studioId: order.studioId,
        event: "purchase_completed",
        orderId: order.id,
        url: webhookUrl,
        payload: payload as unknown as Prisma.InputJsonValue,
        signature,
        attempt: 1,
        maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
        status: "DELIVERED",
        responseStatus,
        deliveredAt: new Date(),
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { deliveryStatus: "DELIVERED", deliveredAt: new Date() },
    }),
  ]);

  await publishOrderEvent(order.id, { deliveryStatus: "DELIVERED" }).catch((err: unknown) =>
    console.error(`mock-webhook-fallback: failed to publish event for ${order.id}`, err),
  );

  console.log(`mock-webhook-fallback: order ${orderId} marked DELIVERED`);
  return true;
}
