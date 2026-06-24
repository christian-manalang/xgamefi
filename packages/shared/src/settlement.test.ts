import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyPayment: vi.fn(),
  add: vi.fn(),
  getQueue: vi.fn(() => ({ add: mocks.add })),
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderCount: vi.fn(),
  ledgerCreate: vi.fn(),
  referralFindFirst: vi.fn(),
  referralUpdateMany: vi.fn(),
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      order: { findUnique: mocks.orderFindUnique, update: mocks.orderUpdate, count: mocks.orderCount },
      ledgerEntry: { create: mocks.ledgerCreate },
      referral: { findFirst: mocks.referralFindFirst, updateMany: mocks.referralUpdateMany },
    }),
  ),
}));

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { $transaction: mocks.$transaction } };
});
vi.mock("./stellar", () => ({ verifyPayment: mocks.verifyPayment }));
vi.mock("./queues", () => ({ getQueue: mocks.getQueue }));

import { verifyAndAdvanceOrder } from "./settlement";

const orderBase = {
  id: "o1",
  studioId: "s1",
  itemId: "i1",
  playerId: "p1",
  quantity: 1,
  currency: "USDT" as const,
  grossAmount: { toFixed: () => "1.0000000" },
  discountAmount: { toFixed: () => "0" },
  platformFeeAmount: { toFixed: () => "0.0500000" },
  netToStudioAmount: { toFixed: () => "0.9500000" },
  idempotencyKey: "idem-1",
  stellarTxHash: null,
  paymentStatus: "PENDING" as const,
  deliveryStatus: "PENDING" as const,
  paidAt: null,
  deliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  item: { id: "i1", studioId: "s1" },
  studio: { id: "s1", platformFeeBps: 500, payoutWalletAddress: "GOUT" },
};

beforeEach(() => {
  mocks.verifyPayment.mockReset();
  mocks.add.mockReset();
  mocks.getQueue.mockClear();
  mocks.$transaction.mockClear();
  mocks.orderFindUnique.mockReset().mockResolvedValue(orderBase);
  mocks.orderUpdate.mockReset().mockResolvedValue(orderBase);
  mocks.orderCount.mockReset().mockResolvedValue(0);
  mocks.ledgerCreate.mockReset().mockResolvedValue({});
  mocks.referralFindFirst.mockReset().mockResolvedValue(null);
  mocks.referralUpdateMany.mockReset().mockResolvedValue({ count: 0 });
});

describe("verifyAndAdvanceOrder", () => {
  it("returns ALREADY when the order is already PAID", async () => {
    mocks.orderFindUnique.mockResolvedValue({ ...orderBase, paymentStatus: "PAID" });
    const res = await verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx1" });
    expect(res.status).toBe("ALREADY");
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
  });

  it("returns PAID and writes ledger + enqueues jobs on successful verification", async () => {
    mocks.verifyPayment.mockResolvedValue({
      ok: true,
      txHash: "tx1",
      amount: { equals: () => true, toFixed: () => "1.0000000" },
      memo: "o1",
      asset: { code: "USDT", issuer: "GISSUER" },
    });

    const res = await verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx1" });

    expect(res.status).toBe("PAID");
    expect(mocks.orderUpdate).toHaveBeenCalled();
    expect(mocks.ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "SALE_IN" }) }),
    );
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.getQueue).toHaveBeenCalledWith("payout");
    expect(mocks.getQueue).toHaveBeenCalledWith("webhook-delivery");
  });

  it("returns REJECTED when verification fails", async () => {
    mocks.verifyPayment.mockResolvedValue({ ok: false, reason: "memo mismatch" });
    const res = await verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx2" });
    expect(res.status).toBe("REJECTED");
    expect((res as { reason?: string }).reason).toBe("memo mismatch");
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects if the order is not found", async () => {
    mocks.orderFindUnique.mockResolvedValue(null);
    await expect(verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx1" })).rejects.toThrow(/not found/);
  });
});
