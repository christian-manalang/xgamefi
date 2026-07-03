import { describe, it, expect, vi, beforeEach } from "vitest";

const { assertOwnsItem, findUnique, create, upsert, p2pListingFindMany, p2pListingCount, p2pTradeFindMany, p2pTradeCount } = vi.hoisted(() => ({
  assertOwnsItem: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  p2pListingFindMany: vi.fn(),
  p2pListingCount: vi.fn(),
  p2pTradeFindMany: vi.fn(),
  p2pTradeCount: vi.fn(),
}));

vi.mock("@xgamefi/shared/p2p/ownership", () => ({ assertOwnsItem }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return {
    ...actual,
    prisma: {
      item: { findUnique },
      p2PListing: { create, findMany: p2pListingFindMany, count: p2pListingCount },
      p2PTrade: { findMany: p2pTradeFindMany, count: p2pTradeCount },
      itemOwnership: { upsert },
    },
  };
});

import { createListing, getStudioP2PListings, getStudioP2PTrades } from "./p2p-queries";
import { Prisma } from "@xgamefi/db";

beforeEach(() => {
  assertOwnsItem.mockReset().mockResolvedValue(undefined);
  findUnique.mockReset().mockResolvedValue({ id: "i1", studioId: "s1", priceCurrency: "USDT" });
  create.mockReset().mockResolvedValue({
    id: "l1", studioId: "s1", itemId: "i1", sellerPlayerId: "p1",
    price: { toFixed: () => "2.5000000" }, currency: "USDT", status: "ACTIVE",
    lockedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  upsert.mockReset().mockResolvedValue({});
  p2pListingFindMany.mockReset().mockResolvedValue([]);
  p2pListingCount.mockReset().mockResolvedValue(0);
  p2pTradeFindMany.mockReset().mockResolvedValue([]);
  p2pTradeCount.mockReset().mockResolvedValue(0);
});

describe("createListing", () => {
  it("creates an ACTIVE listing and locks ownership", async () => {
    const listing = await createListing({ sellerPlayerId: "p1", itemId: "i1", price: "2.5", currency: "USDT" });
    expect(listing.id).toBe("l1");
    expect(assertOwnsItem).toHaveBeenCalledWith({ studioId: "s1", playerId: "p1", itemId: "i1" });
    expect(upsert).toHaveBeenCalled();
  });
});

function listingRow(studioId: string) {
  return {
    id: "l1",
    studioId,
    itemId: "i1",
    sellerPlayerId: "p1",
    price: new Prisma.Decimal("2.5"),
    currency: "USDT" as const,
    status: "ACTIVE" as const,
    lockedAt: null,
    createdAt: new Date("2026-06-23T12:00:00.000Z"),
    updatedAt: new Date("2026-06-23T12:00:00.000Z"),
    item: { name: "Sword" },
    seller: { walletAddress: "GSELLER", handle: "seller_handle" },
  };
}

function tradeRow(studioId: string) {
  return {
    id: "t1",
    listingId: "l1",
    buyerPlayerId: "p2",
    sellerPlayerId: "p1",
    price: new Prisma.Decimal("2.5"),
    currency: "USDT" as const,
    platformFeeAmount: new Prisma.Decimal("0.125"),
    netToSellerAmount: new Prisma.Decimal("2.375"),
    escrowTxHash: null,
    payoutTxHash: null,
    status: "ESCROW_PENDING" as const,
    idempotencyKey: "idem-1",
    createdAt: new Date("2026-06-23T12:00:00.000Z"),
    completedAt: null,
    listing: { item: { name: "Sword" }, studioId },
    buyer: { walletAddress: "GBUYER" },
    seller: { walletAddress: "GSELLER" },
  };
}

describe("getStudioP2PListings", () => {
  it("returns tenant-isolated, paginated listing DTOs with item and seller", async () => {
    p2pListingFindMany.mockResolvedValue([listingRow("s1")]);
    p2pListingCount.mockResolvedValue(1);

    const result = await getStudioP2PListings("s1", { status: "ACTIVE", page: 2, pageSize: 10 });

    expect(p2pListingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studioId: "s1", status: "ACTIVE" },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.total).toBe(1);
    expect(result.listings[0]).toBeDefined();
    expect(result.listings[0]!.itemName).toBe("Sword");
    expect(result.listings[0]!.sellerWallet).toBe("GSELLER");
    expect(result.listings[0]!.price.amount).toBe("2.5000000");
  });

  it("ignores status filter when omitted", async () => {
    p2pListingFindMany.mockResolvedValue([]);
    p2pListingCount.mockResolvedValue(0);

    await getStudioP2PListings("s1", { page: 1, pageSize: 25 });
    expect(p2pListingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studioId: "s1" } }),
    );
  });
});

describe("getStudioP2PTrades", () => {
  it("returns tenant-isolated, paginated trade DTOs with item and counterparties", async () => {
    p2pTradeFindMany.mockResolvedValue([tradeRow("s1")]);
    p2pTradeCount.mockResolvedValue(1);

    const result = await getStudioP2PTrades("s1", { status: "COMPLETED", page: 1, pageSize: 25 });

    expect(p2pTradeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listing: { studioId: "s1" }, status: "COMPLETED" },
        skip: 0,
        take: 25,
      }),
    );
    expect(result.total).toBe(1);
    expect(result.trades[0]).toBeDefined();
    expect(result.trades[0]!.itemName).toBe("Sword");
    expect(result.trades[0]!.buyerWallet).toBe("GBUYER");
    expect(result.trades[0]!.sellerWallet).toBe("GSELLER");
    expect(result.trades[0]!.platformFeeAmount).toBe("0.1250000");
  });

  it("filters by trade status when provided", async () => {
    p2pTradeFindMany.mockResolvedValue([]);
    p2pTradeCount.mockResolvedValue(0);

    await getStudioP2PTrades("s1", { status: "PAID", page: 1, pageSize: 25 });
    expect(p2pTradeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { listing: { studioId: "s1" }, status: "PAID" } }),
    );
  });
});
