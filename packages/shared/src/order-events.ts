import { getRedis } from "./queues";

export async function publishOrderEvent(
  orderId: string,
  event: { paymentStatus?: string; deliveryStatus?: string },
): Promise<void> {
  await getRedis().publish(`order-events:${orderId}`, JSON.stringify(event));
}
