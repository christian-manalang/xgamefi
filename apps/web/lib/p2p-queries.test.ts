import { describe, it, expect, vi, beforeEach } from "vitest";

const { assertOwnsItem, findUnique, create, upsert } = vi.hoisted(() => ({
  assertOwnsItem: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@xgamefi/shared/p2p/ownership", () => ({ assertOwnsItem }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { item: { findUnique }, p2PListing: { create }, itemOwnership: { upsert } } };
});

import { createListing } from "./p2p-queries";

beforeEach(() => {
  assertOwnsItem.mockReset().mockResolvedValue(undefined);
  findUnique.mockReset().mockResolvedValue({ id: "i1", studioId: "s1", priceCurrency: "USDT" });
  create.mockReset().mockResolvedValue({
    id: "l1", studioId: "s1", itemId: "i1", sellerPlayerId: "p1",
    price: { toFixed: () => "2.5000000" }, currency: "USDT", status: "ACTIVE",
    lockedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  upsert.mockReset().mockResolvedValue({});
});

describe("createListing", () => {
  it("creates an ACTIVE listing and locks ownership", async () => {
    const listing = await createListing({ sellerPlayerId: "p1", itemId: "i1", price: "2.5", currency: "USDT" });
    expect(listing.id).toBe("l1");
    expect(assertOwnsItem).toHaveBeenCalledWith({ studioId: "s1", playerId: "p1", itemId: "i1" });
    expect(upsert).toHaveBeenCalled();
  });
});
