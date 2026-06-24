import { describe, it, expect, vi, beforeEach } from "vitest";

const { safeFetch, findUnique, upsert } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../ssrf", () => ({ safeFetch }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { studio: { findUnique }, itemOwnership: { upsert } } };
});

import { refreshOwnership, assertOwnsItem } from "./ownership";

beforeEach(() => {
  safeFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ quantity: 3 }), { status: 200 }));
  findUnique.mockReset().mockResolvedValue({ id: "s1", apiBaseUrl: "https://api.gridlock.gg" });
  upsert.mockReset().mockResolvedValue({ quantity: 3 });
});

describe("refreshOwnership", () => {
  it("fetches inventory through safeFetch and upserts ownership", async () => {
    const res = await refreshOwnership({ studioId: "s1", playerId: "p1", itemId: "i1" });
    expect(res.quantity).toBe(3);
    expect(safeFetch).toHaveBeenCalledWith("https://api.gridlock.gg/players/p1/inventory/i1", expect.any(Object));
    expect(upsert).toHaveBeenCalled();
  });

  it("throws when the game reports zero quantity", async () => {
    safeFetch.mockResolvedValue(new Response(JSON.stringify({ quantity: 0 }), { status: 200 }));
    await expect(assertOwnsItem({ studioId: "s1", playerId: "p1", itemId: "i1" })).rejects.toThrow(/own/);
  });
});
