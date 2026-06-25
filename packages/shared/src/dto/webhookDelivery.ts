export type WebhookDeliveryDto = {
  id: string;
  event: string;
  orderId: string | null;
  tradeId: string | null;
  url: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  responseStatus: number | null;
  nextAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

export function toWebhookDeliveryDto(row: {
  id: string;
  event: string;
  orderId: string | null;
  tradeId: string | null;
  url: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  responseStatus: number | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
}): WebhookDeliveryDto {
  return {
    id: row.id,
    event: row.event,
    orderId: row.orderId,
    tradeId: row.tradeId,
    url: row.url,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    responseStatus: row.responseStatus,
    nextAttemptAt: row.nextAttemptAt ? row.nextAttemptAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  };
}
