import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  createOrderQuote: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal: mocks.requirePrincipal }));
vi.mock("@/lib/checkout-queries", () => ({ createOrderQuote: mocks.createOrderQuote }));

import { POST } from "./route";

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  mocks.createOrderQuote.mockReset().mockResolvedValue({
    order: { id: "o1" },
    quote: { destination: "GRECEIVER", asset: { code: "USDT", issuer: "GISSUER" }, amount: "1.0000000", memo: "o1", unsignedXdr: "xdr" },
  });
});

describe("POST /checkout/quote", () => {
  it("requires a player principal", async () => {
    mocks.requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN", userId: "u1" });
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ itemId: "i1" }) }));
    expect(res.status).toBe(403);
  });

  it("returns order + quote for valid input", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ itemId: "11111111-1111-1111-1111-111111111111" }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.id).toBe("o1");
    expect(body.quote.memo).toBe("o1");
    expect(mocks.createOrderQuote).toHaveBeenCalledWith(expect.objectContaining({ playerId: "p1", itemId: "11111111-1111-1111-1111-111111111111" }));
  });
});
