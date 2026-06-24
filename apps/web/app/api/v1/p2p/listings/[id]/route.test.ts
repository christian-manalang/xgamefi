import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { p2PListing: { findUnique } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "l1" }) };

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue({
    id: "l1", studioId: "s1", itemId: "i1", sellerPlayerId: "p1",
    price: { toFixed: () => "2.5000000" }, currency: "USDT", status: "ACTIVE",
    lockedAt: null, createdAt: new Date("2026-06-23T12:00:00.000Z"), updatedAt: new Date(),
  });
});

describe("GET /p2p/listings/:id", () => {
  it("returns the listing", async () => {
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).listing.id).toBe("l1");
  });

  it("404 when missing", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
