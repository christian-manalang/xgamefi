import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePrincipal, verifyAndAdvanceP2PTrade, getTrade } = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  verifyAndAdvanceP2PTrade: vi.fn(),
  getTrade: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal }));
vi.mock("@xgamefi/shared/p2p/settlement", () => ({ verifyAndAdvanceP2PTrade }));
vi.mock("@/lib/p2p-queries", () => ({ getTrade }));
vi.mock("@xgamefi/shared/idempotency", () => ({ withIdempotency: async (_a: unknown, fn: () => unknown) => fn() }));
vi.mock("@xgamefi/shared/queues", () => ({ getRedis: () => ({}) }));

import { POST } from "./route";

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p2", walletAddress: "GBUYER" });
  verifyAndAdvanceP2PTrade.mockReset().mockResolvedValue({ status: "PAID" });
  getTrade.mockReset().mockResolvedValue({ id: "t1", status: "PAID" });
});

describe("POST /p2p/trades/submit", () => {
  it("requires idempotency-key", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ tradeId: "11111111-1111-1111-1111-111111111111", txHash: "tx" }) }));
    expect(res.status).toBe(400);
  });

  it("advances the trade and returns result", async () => {
    const res = await POST(new Request("https://x", {
      method: "POST",
      body: JSON.stringify({ tradeId: "11111111-1111-1111-1111-111111111111", txHash: "tx" }),
      headers: new Headers({ "idempotency-key": "idem-1" }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.status).toBe("PAID");
  });
});
