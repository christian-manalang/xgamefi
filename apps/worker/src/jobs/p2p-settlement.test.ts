import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyAndAdvanceP2PTrade, transferItemAndPayout } = vi.hoisted(() => ({
  verifyAndAdvanceP2PTrade: vi.fn(),
  transferItemAndPayout: vi.fn(),
}));

vi.mock("@xgamefi/shared/p2p/settlement", () => ({ verifyAndAdvanceP2PTrade, transferItemAndPayout }));
vi.mock("@xgamefi/shared/queues", () => ({ registerWorker: vi.fn(), getRedis: () => ({}) }));

import { p2pSettlementProcessor } from "./p2p-settlement";

beforeEach(() => {
  verifyAndAdvanceP2PTrade.mockReset().mockResolvedValue({ status: "PAID" });
  transferItemAndPayout.mockReset().mockResolvedValue({ status: "COMPLETED" });
});

describe("p2pSettlementProcessor", () => {
  it("calls transferItemAndPayout for transfer phase", async () => {
    const res = await p2pSettlementProcessor({ data: { tradeId: "t1", phase: "transfer" } });
    expect(transferItemAndPayout).toHaveBeenCalledWith({ tradeId: "t1" });
    expect(res.status).toBe("COMPLETED");
  });
});
