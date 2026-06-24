import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  itemFindUnique: vi.fn(),
  orderCreate: vi.fn(),
  buildPaymentXdr: vi.fn(),
}));

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return {
    ...actual,
    prisma: {
      item: { findUnique: mocks.itemFindUnique },
      order: { create: mocks.orderCreate },
    },
  };
});

vi.mock("@xgamefi/config/env", () => ({
  env: {
    STELLAR_RECEIVING_ACCOUNT: "GRECEIVER",
    STELLAR_USD_ASSET_CODE: "USDT",
    STELLAR_USD_ASSET_ISSUER: "GISSUER",
    PLATFORM_FEE_BPS: "500",
  },
}));

vi.mock("@xgamefi/shared/stellar", () => ({
  buildPaymentXdr: mocks.buildPaymentXdr,
}));

import { createOrderQuote } from "./checkout-queries";

beforeEach(() => {
  mocks.itemFindUnique.mockReset().mockResolvedValue({
    id: "i1",
    studioId: "s1",
    priceAmount: { times: () => ({ toFixed: () => "1.0000000" }) },
    priceCurrency: "USDT",
  });
  mocks.orderCreate.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    itemId: "i1",
    playerId: "p1",
    quantity: 1,
    currency: "USDT",
    grossAmount: { toFixed: () => "1.0000000" },
    discountAmount: { toFixed: () => "0" },
    platformFeeAmount: { toFixed: () => "0.0500000" },
    netToStudioAmount: { toFixed: () => "0.9500000" },
    idempotencyKey: "idem-1",
    stellarTxHash: null,
    paymentStatus: "PENDING",
    deliveryStatus: "PENDING",
    paidAt: null,
    deliveredAt: null,
    createdAt: new Date("2026-06-23T12:00:00.000Z"),
    updatedAt: new Date("2026-06-23T12:00:00.000Z"),
  });
  mocks.buildPaymentXdr.mockReset().mockResolvedValue("xdr");
});

describe("createOrderQuote", () => {
  it("creates a pending order with memo bound to order id", async () => {
    const res = await createOrderQuote({ playerId: "p1", itemId: "i1", quantity: 1 });
    expect(res.order.id).toBe("o1");
    expect(res.quote.memo).toBe("o1");
    expect(res.quote.destination).toBe("GRECEIVER");
    expect(mocks.orderCreate).toHaveBeenCalled();
  });
});
