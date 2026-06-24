import { describe, it, expect } from "vitest";
import { toWebhookDeliveryDto } from "./webhook";

const row = {
  id: "w1",
  studioId: "s1",
  event: "purchase_completed" as const,
  orderId: "o1",
  tradeId: null,
  url: "https://hooks.gridlock.gg/xgamefi",
  payload: { event: "purchase.completed" },
  signature: "t=1,v1=abc",
  attempt: 2,
  maxAttempts: 5,
  status: "PENDING" as const,
  responseStatus: null,
  nextAttemptAt: null,
  createdAt: new Date("2026-06-23T12:00:00.000Z"),
  deliveredAt: null,
};

describe("toWebhookDeliveryDto", () => {
  it("maps the webhook delivery row to a DTO", () => {
    const dto = toWebhookDeliveryDto(row);
    expect(dto.event).toBe("purchase.completed");
    expect(dto.status).toBe("PENDING");
    expect(dto.responseStatus).toBeNull();
    expect(dto.deliveredAt).toBeNull();
    expect(dto.createdAt).toBe("2026-06-23T12:00:00.000Z");
  });
});
