import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

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

import { refundProcessor } from "./refund";

beforeEach(() => {
  mocks.findUnique.mockReset().mockResolvedValue({ id: "o1", paymentStatus: "PAID", grossAmount: { toFixed: () => "1.0000000" }, currency: "USDT" });
  mocks.update.mockReset().mockResolvedValue({});
  mocks.create.mockReset().mockResolvedValue({});
});

describe("refundProcessor (Phase 3 stub)", () => {
  it("marks order REFUNDED and writes a pending REFUND ledger entry", async () => {
    const res = await refundProcessor({ data: { orderId: "o1" } });
    expect(res.status).toBe("PENDING");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: "REFUNDED" } }));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "REFUND", status: "PENDING" }) }),
    );
  });
});
