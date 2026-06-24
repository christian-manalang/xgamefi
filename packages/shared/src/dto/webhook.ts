export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "EXHAUSTED";

export type WebhookDeliveryRow = {
  id: string;
  studioId: string;
  event: string;
  orderId: string | null;
  tradeId: string | null;
  url: string;
  payload: unknown;
  signature: string;
  attempt: number;
  maxAttempts: number;
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
};

export type WebhookDeliveryDto = {
  id: string;
  studioId: string;
  event: string;
  orderId: string | null;
  attempt: number;
  maxAttempts: number;
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
};

function wireEvent(event: string): string {
  return event.replace(/_/g, ".");
}

export function toWebhookDeliveryDto(row: WebhookDeliveryRow): WebhookDeliveryDto {
  return {
    id: row.id,
    studioId: row.studioId,
    event: wireEvent(row.event),
    orderId: row.orderId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    status: row.status,
    responseStatus: row.responseStatus,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
