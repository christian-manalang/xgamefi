import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePrincipal, createTradeQuote } = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  createTradeQuote: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal }));
vi.mock("@/lib/p2p-queries", () => ({ createTradeQuote }));

import { POST } from "./route";

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p2", walletAddress: "GBUYER" });
  createTradeQuote.mockReset().mockResolvedValue({
    trade: { id: "t1" },
    quote: { destination: "GRECEIVER", asset: { code: "USDT", issuer: "GISSUER" }, amount: "2.5000000", memo: "t1", unsignedXdr: "xdr" },
  });
});

describe("POST /p2p/trades/quote", () => {
  it("rejects non-player principals", async () => {
    requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN" });
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ listingId: "11111111-1111-1111-1111-111111111111" }) }));
    expect(res.status).toBe(403);
  });

  it("returns trade + quote", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ listingId: "11111111-1111-1111-1111-111111111111" }) }));
    expect(res.status).toBe(200);
    expect(createTradeQuote).toHaveBeenCalledWith({ buyerPlayerId: "p2", listingId: "11111111-1111-1111-1111-111111111111" });
  });
});
