import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  signWebhook: vi.fn(() => "t=1,v1=abc"),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  orderUpdate: vi.fn(),
  getQueue: vi.fn(() => ({ add: vi.fn() })),
  toOrderDto: vi.fn((o) => o),
  toP2PTradeDto: vi.fn((t) => t),
  tradeFindUnique: vi.fn(),
}));

vi.mock("@xgamefi/shared/ssrf", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("@xgamefi/shared/hmac", () => ({ signWebhook: mocks.signWebhook }));
vi.mock("@xgamefi/shared/queues", () => ({ registerWorker: vi.fn(), getQueue: mocks.getQueue }));
vi.mock("@xgamefi/shared/dto", () => ({ toOrderDto: mocks.toOrderDto, toP2PTradeDto: mocks.toP2PTradeDto }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return {
    ...actual,
    prisma: {
      $transaction: vi.fn(async (ops: unknown[]) => {
        for (const op of ops) await op;
      }),
      order: { findUnique: mocks.findUnique, update: mocks.orderUpdate },
      p2PTrade: { findUnique: mocks.tradeFindUnique },
      webhookDelivery: { create: mocks.create, update: mocks.update },
      studio: { findUnique: vi.fn() },
    },
  };
});
vi.mock("@xgamefi/config/env", () => ({
  env: { WEBHOOK_MAX_ATTEMPTS: 5, WEBHOOK_TIMESTAMP_TOLERANCE_SEC: 300 },
}));

import { webhookDeliveryProcessor } from "./webhook-delivery";

beforeEach(() => {
  mocks.safeFetch.mockReset().mockResolvedValue(new Response("ok", { status: 200 }));
  mocks.findUnique.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    paymentStatus: "PAID",
    deliveryStatus: "PENDING",
    studio: { webhookUrl: "https://hooks.gridlock.gg/xgamefi", webhookSecretHash: "hash" },
  });
  mocks.create.mockReset().mockResolvedValue({ id: "wd1", attempt: 0, maxAttempts: 5 });
  mocks.update.mockReset().mockResolvedValue({});
  mocks.orderUpdate.mockReset().mockResolvedValue({});
  mocks.tradeFindUnique.mockReset().mockResolvedValue({
    id: "t1",
    status: "COMPLETED",
    listing: { item: { studio: { id: "s1", webhookUrl: "https://hooks.gridlock.gg/xgamefi", webhookSecretHash: "hash" } } },
  });
});

describe("webhookDeliveryProcessor", () => {
  it("delivers purchase.completed on 2xx and marks delivered", async () => {
    const res = await webhookDeliveryProcessor({ data: { orderId: "o1" } });
    expect(res.status).toBe("DELIVERED");
    expect(mocks.safeFetch).toHaveBeenCalled();
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveryStatus: "DELIVERED" }) }),
    );
  });

  it("increments attempt and schedules retry on failure", async () => {
    mocks.safeFetch.mockResolvedValue(new Response("err", { status: 500 }));
    await expect(webhookDeliveryProcessor({ data: { orderId: "o1" } })).rejects.toThrow(/attempt 1/);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempt: expect.any(Number) }) }),
    );
  });

  it("delivers p2p_trade_completed for a trade", async () => {
    const res = await webhookDeliveryProcessor({ data: { tradeId: "t1", event: "p2p_trade_completed" } });
    expect(res.status).toBe("DELIVERED");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: "p2p_trade_completed", tradeId: "t1" }) }),
    );
  });
});
