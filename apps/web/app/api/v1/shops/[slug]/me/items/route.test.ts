import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePrincipal, getMySellableItems } = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  getMySellableItems: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal }));
vi.mock("@/lib/p2p-queries", () => ({ getMySellableItems }));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ slug: "gridlock" }) };

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  getMySellableItems.mockReset().mockResolvedValue([]);
});

describe("GET /shops/:slug/me/items", () => {
  it("requires a player principal", async () => {
    requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN" });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(403);
  });

  it("returns the player’s sellable items", async () => {
    getMySellableItems.mockResolvedValue([
      { itemId: "i1", name: "Sword Skin", imageUrl: null, rarity: "LEGENDARY", category: "skins", quantity: 3 },
    ]);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemId).toBe("i1");
    expect(getMySellableItems).toHaveBeenCalledWith("gridlock", "p1");
  });
});
