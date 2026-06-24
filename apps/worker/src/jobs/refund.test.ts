import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendPayment, findUniqueOrder, findUniqueTrade, updateOrder, updateTrade, createLedger } = vi.hoisted(() => ({
  sendPayment: vi.fn(),
  findUniqueOrder: vi.fn(),
  findUniqueTrade: vi.fn(),
  updateOrder: vi.fn(),
  updateTrade: vi.fn(),
  createLedger: vi.fn(),
}));

vi.mock("@xgamefi/shared/stellar", () => ({ sendPayment }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return {
    ...actual,
    prisma: {
      $transaction: vi.fn(async (ops: unknown[]) => {
        for (const op of ops) await op;
      }),
      order: { findUnique: findUniqueOrder, update: updateOrder },
      p2PTrade: { findUnique: findUniqueTrade, update: updateTrade },
      ledgerEntry: { create: createLedger },
    },
  };
});

import { refundProcessor } from "./refund";

beforeEach(() => {
  sendPayment.mockReset().mockResolvedValue({ txHash: "refund-tx" });
  findUniqueOrder.mockReset().mockResolvedValue({ id: "o1", paymentStatus: "PAID", grossAmount: { toFixed: () => "1.0000000" }, currency: "USDT", player: { walletAddress: "GBUYER" } });
  findUniqueTrade.mockReset().mockResolvedValue({ id: "t1", price: { toFixed: () => "2.5000000" }, currency: "USDT", buyer: { walletAddress: "GBUYER2" } });
  updateOrder.mockReset().mockResolvedValue({});
  updateTrade.mockReset().mockResolvedValue({});
  createLedger.mockReset().mockResolvedValue({});
});

describe("refundProcessor", () => {
  it("refunds an order and writes a CONFIRMED REFUND ledger entry", async () => {
    const res = await refundProcessor({ data: { kind: "order", orderId: "o1" } });
    expect(res.status).toBe("CONFIRMED");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GBUYER", amount: "1.0000000" }));
    expect(updateOrder).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: "REFUNDED" } }));
    expect(createLedger).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "REFUND", status: "CONFIRMED" }) }),
    );
  });

  it("refunds a P2P trade and marks it REFUNDED", async () => {
    const res = await refundProcessor({ data: { kind: "p2p", tradeId: "t1" } });
    expect(res.status).toBe("CONFIRMED");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GBUYER2", amount: "2.5000000" }));
    expect(updateTrade).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REFUNDED" } }));
  });
});
