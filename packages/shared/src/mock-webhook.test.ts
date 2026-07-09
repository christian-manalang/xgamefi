import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  webhookDeliveryCreate: vi.fn(),
  orderUpdate: vi.fn(),
  $transaction: vi.fn(async (ops: unknown[]) => {
    for (const op of ops) await op;
  }),
  signWebhook: vi.fn(() => "sig"),
  toOrderDto: vi.fn((o: unknown) => o),
  publishOrderEvent: vi.fn(async () => {}),
  fetch: vi.fn(),
}));

vi.mock("@xgamefi/db", () => ({
  prisma: {
    order: { findUnique: mocks.orderFindUnique, update: mocks.orderUpdate },
    webhookDelivery: { create: mocks.webhookDeliveryCreate },
    $transaction: mocks.$transaction,
  },
  Prisma: { InputJsonValue: {} as never },
}));

vi.mock("@xgamefi/config/env", () => ({
  env: { APP_BASE_URL: "https://xgamefi-staging.example.com", WEBHOOK_MAX_ATTEMPTS: 5 },
}));

vi.mock("./hmac", () => ({ signWebhook: mocks.signWebhook }));
vi.mock("./dto", () => ({ toOrderDto: mocks.toOrderDto }));
vi.mock("./order-events", () => ({ publishOrderEvent: mocks.publishOrderEvent }));

import { deliverMockGameWebhook, isMockGameWebhook } from "./mock-webhook";

describe("mock-webhook", () => {
  beforeEach(() => {
    mocks.orderFindUnique.mockReset();
    mocks.webhookDeliveryCreate.mockReset();
    mocks.orderUpdate.mockReset();
    mocks.$transaction.mockClear();
    mocks.signWebhook.mockReset();
    mocks.toOrderDto.mockReset();
    mocks.publishOrderEvent.mockReset();
    mocks.fetch.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mocks.fetch;
  });

  it("isMockGameWebhook returns true only for the mock path", () => {
    expect(isMockGameWebhook("https://example.com/api/mock-game/webhook")).toBe(true);
    expect(isMockGameWebhook("https://example.com/api/other/webhook")).toBe(false);
  });

  it("returns false and does nothing for non-mock webhooks", async () => {
    mocks.orderFindUnique.mockResolvedValue({
      id: "o1",
      paymentStatus: "PAID",
      deliveryStatus: "PENDING",
      studioId: "s1",
      studio: { webhookUrl: "https://example.com/webhook", webhookSecretHash: "hash" },
    });

    const res = await deliverMockGameWebhook("o1");

    expect(res).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns true without fetching if already DELIVERED", async () => {
    mocks.orderFindUnique.mockResolvedValue({
      id: "o1",
      paymentStatus: "PAID",
      deliveryStatus: "DELIVERED",
      studioId: "s1",
      studio: { webhookUrl: "https://example.com/api/mock-game/webhook", webhookSecretHash: "hash" },
    });

    const res = await deliverMockGameWebhook("o1");

    expect(res).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("delivers the mock webhook and updates order/delivery records", async () => {
    mocks.orderFindUnique.mockResolvedValue({
      id: "o1",
      paymentStatus: "PAID",
      deliveryStatus: "PENDING",
      studioId: "s1",
      studio: { webhookUrl: "https://old.example.com/api/mock-game/webhook", webhookSecretHash: "hash" },
      item: { id: "i1" },
    });
    mocks.fetch.mockResolvedValue({ ok: true, status: 200 });

    const res = await deliverMockGameWebhook("o1");

    expect(res).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://xgamefi-staging.example.com/api/mock-game/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-XGameFi-Signature": "sig",
        }),
      }),
    );
    expect(mocks.webhookDeliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DELIVERED", orderId: "o1" }) }),
    );
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, data: expect.objectContaining({ deliveryStatus: "DELIVERED" }) }),
    );
    expect(mocks.publishOrderEvent).toHaveBeenCalledWith("o1", { deliveryStatus: "DELIVERED" });
  });

  it("returns false when the mock endpoint returns non-ok", async () => {
    mocks.orderFindUnique.mockResolvedValue({
      id: "o1",
      paymentStatus: "PAID",
      deliveryStatus: "PENDING",
      studioId: "s1",
      studio: { webhookUrl: "https://example.com/api/mock-game/webhook", webhookSecretHash: "hash" },
      item: { id: "i1" },
    });
    mocks.fetch.mockResolvedValue({ ok: false, status: 500 });

    const res = await deliverMockGameWebhook("o1");

    expect(res).toBe(false);
    expect(mocks.webhookDeliveryCreate).not.toHaveBeenCalled();
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
  });
});
