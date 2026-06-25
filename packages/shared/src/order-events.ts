import { getRedis } from "./queues";

export async function publishOrderEvent(
  orderId: string,
  event: { paymentStatus?: string; deliveryStatus?: string },
): Promise<void> {
  const payload = JSON.stringify(event);
  console.log(`[order-events] publish order-events:${orderId} ${payload}`);
  await getRedis().publish(`order-events:${orderId}`, payload);
}
