import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePrincipal, createListing } = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  createListing: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal }));
vi.mock("@/lib/p2p-queries", () => ({ createListing }));

import { POST } from "./route";

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  createListing.mockReset().mockResolvedValue({ id: "l1", price: { amount: "2.5000000", currency: "USDT" }, status: "ACTIVE" });
});

describe("POST /p2p/listings", () => {
  it("requires a player principal", async () => {
    requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN" });
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ itemId: "11111111-1111-1111-1111-111111111111", price: "2.5", currency: "USDT" }) }));
    expect(res.status).toBe(403);
  });

  it("creates a listing", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ itemId: "11111111-1111-1111-1111-111111111111", price: "2.5", currency: "USDT" }) }));
    expect(res.status).toBe(201);
    expect((await res.json()).listing.status).toBe("ACTIVE");
  });
});
