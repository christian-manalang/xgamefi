import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@xgamefi/db";

const mocks = vi.hoisted(() => ({
  sendPayment: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@xgamefi/shared/stellar", () => ({ sendPayment: mocks.sendPayment }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return {
    ...actual,
    prisma: {
      $transaction: vi.fn(async (ops: unknown[]) => {
        for (const op of ops) await op;
      }),
      order: { findUnique: mocks.findUnique, update: mocks.update },
      ledgerEntry: { create: mocks.create },
    },
  };
});

import { payoutProcessor } from "./payout";

beforeEach(() => {
  mocks.sendPayment.mockReset().mockResolvedValue({ txHash: "payout-tx-1" });
  mocks.findUnique.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    currency: "USDT",
    netToStudioAmount: new Prisma.Decimal("0.95"),
    paymentStatus: "PAID",
    stellarTxHash: "tx1",
    studio: { payoutWalletAddress: "GOUT" },
  });
  mocks.update.mockReset().mockResolvedValue({});
  mocks.create.mockReset().mockResolvedValue({});
});

describe("payoutProcessor", () => {
  it("sends net amount and writes PAYOUT_OUT ledger entry", async () => {
    const res = await payoutProcessor({ data: { orderId: "o1" } });
    expect(res.txHash).toBe("payout-tx-1");
    expect(mocks.sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GOUT", amount: "0.9500000" }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PAYOUT_OUT" }) }));
  });

  it("skips if the order is not PAID", async () => {
    mocks.findUnique.mockResolvedValue({ paymentStatus: "PENDING" });
    await expect(payoutProcessor({ data: { orderId: "o1" } })).rejects.toThrow(/PAID/);
  });
});
