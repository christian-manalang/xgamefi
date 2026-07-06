import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  shopFindFirst: vi.fn(),
  itemFindMany: vi.fn(),
  itemCount: vi.fn(),
}));

vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: {
    shop: { findFirst: mocks.shopFindFirst },
    item: { findMany: mocks.itemFindMany, count: mocks.itemCount },
  } };
});

import { getShopItems } from "./catalogue-queries";

const itemRow = {
  id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
  description: null, imageUrl: null, priceAmount: { toString: () => "1", toFixed: () => "1.0000000" },
  priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: "skins",
  metadata: {}, isActive: true, isListed: true, syncedAt: null,
};

beforeEach(() => {
  mocks.shopFindFirst.mockReset().mockResolvedValue({ studioId: "stu1", featuredItemIds: ["i1"] });
  mocks.itemFindMany.mockReset().mockResolvedValue([itemRow]);
  mocks.itemCount.mockReset().mockResolvedValue(1);
});

describe("getShopItems", () => {
  it("filters active items by search term and paginates", async () => {
    const res = await getShopItems("gridlock", { q: "sword", page: 1, pageSize: 24 });
    expect(mocks.itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        studioId: "stu1", isActive: true, isListed: true,
        name: { contains: "sword", mode: "insensitive" },
      }),
      skip: 0, take: 24,
    }));
    expect(res).toEqual({ items: [expect.objectContaining({ externalId: "sword_skin_01" })], total: 1, page: 1, pageSize: 24 });
  });
  it("filters by featured using Shop.featuredItemIds", async () => {
    await getShopItems("gridlock", { featured: true, page: 1, pageSize: 24 });
    expect(mocks.itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["i1"] } }),
    }));
  });
  it("returns empty when the slug has no published shop", async () => {
    mocks.shopFindFirst.mockResolvedValue(null);
    const res = await getShopItems("nope", { page: 1, pageSize: 24 });
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 24 });
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
  });
});
