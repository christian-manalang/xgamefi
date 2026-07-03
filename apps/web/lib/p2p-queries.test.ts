import { describe, it, expect, vi, beforeEach } from "vitest";

const { assertOwnsItem, refreshOwnership, findUnique, create, upsert, shopFindFirst, itemOwnershipFindMany } = vi.hoisted(() => ({
  assertOwnsItem: vi.fn(),
  refreshOwnership: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  shopFindFirst: vi.fn(),
  itemOwnershipFindMany: vi.fn(),
}));

vi.mock("@xgamefi/shared/p2p/ownership", () => ({ assertOwnsItem, refreshOwnership }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return {
    ...actual,
    prisma: {
      item: { findUnique },
      p2PListing: { create },
      itemOwnership: { upsert, findMany: itemOwnershipFindMany },
      shop: { findFirst: shopFindFirst },
    },
  };
});

import { createListing, getMySellableItems } from "./p2p-queries";

beforeEach(() => {
  assertOwnsItem.mockReset().mockResolvedValue(undefined);
  refreshOwnership.mockReset().mockResolvedValue({ quantity: 3 });
  findUnique.mockReset().mockResolvedValue({ id: "i1", studioId: "s1", priceCurrency: "USDT" });
  create.mockReset().mockResolvedValue({
    id: "l1", studioId: "s1", itemId: "i1", sellerPlayerId: "p1",
    price: { toFixed: () => "2.5000000" }, currency: "USDT", status: "ACTIVE",
    lockedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  upsert.mockReset().mockResolvedValue({});
  shopFindFirst.mockReset().mockResolvedValue({ studioId: "s1" });
  itemOwnershipFindMany.mockReset().mockResolvedValue([
    {
      playerId: "p1",
      itemId: "i1",
      studioId: "s1",
      quantity: 3,
      lockedForListingId: null,
      item: { id: "i1", name: "Sword Skin", imageUrl: null, rarity: "LEGENDARY", category: "skins" },
    },
  ]);
});

describe("createListing", () => {
  it("creates an ACTIVE listing and locks ownership", async () => {
    const listing = await createListing({ sellerPlayerId: "p1", itemId: "i1", price: "2.5", currency: "USDT" });
    expect(listing.id).toBe("l1");
    expect(assertOwnsItem).toHaveBeenCalledWith({ studioId: "s1", playerId: "p1", itemId: "i1" });
    expect(upsert).toHaveBeenCalled();
  });
});

describe("getMySellableItems", () => {
  it("returns unlocked items after refreshing ownership", async () => {
    const items = await getMySellableItems("gridlock", "p1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemId: "i1", name: "Sword Skin", quantity: 3 });
    expect(shopFindFirst).toHaveBeenCalledWith({
      where: { studio: { slug: "gridlock" }, status: "PUBLISHED" },
      select: { studioId: true },
    });
    expect(refreshOwnership).toHaveBeenCalledWith({ studioId: "s1", playerId: "p1", itemId: "i1" });
  });

  it("returns an empty array when the shop is not found", async () => {
    shopFindFirst.mockResolvedValue(null);
    const items = await getMySellableItems("missing", "p1");
    expect(items).toEqual([]);
    expect(refreshOwnership).not.toHaveBeenCalled();
  });

  it("filters out items that are locked for an existing listing", async () => {
    itemOwnershipFindMany
      .mockResolvedValueOnce([
        {
          playerId: "p1",
          itemId: "i1",
          studioId: "s1",
          quantity: 3,
          lockedForListingId: null,
          item: { id: "i1", name: "Sword Skin", imageUrl: null, rarity: "LEGENDARY", category: "skins" },
        },
        {
          playerId: "p1",
          itemId: "i2",
          studioId: "s1",
          quantity: 1,
          lockedForListingId: "l1",
          item: { id: "i2", name: "Locked Core", imageUrl: null, rarity: "EPIC", category: "cores" },
        },
      ])
      .mockResolvedValue([
        {
          playerId: "p1",
          itemId: "i1",
          studioId: "s1",
          quantity: 3,
          lockedForListingId: null,
          item: { id: "i1", name: "Sword Skin", imageUrl: null, rarity: "LEGENDARY", category: "skins" },
        },
      ]);
    const items = await getMySellableItems("gridlock", "p1");
    expect(items.map((i) => i.itemId)).toEqual(["i1"]);
  });
});
