import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toP2PListingDto, toP2PTradeDto } from "./p2p";

const listingRow = {
  id: "l1",
  studioId: "s1",
  itemId: "i1",
  sellerPlayerId: "p1",
  price: new Prisma.Decimal("2.5"),
  currency: "USDT" as const,
  status: "ACTIVE" as const,
  lockedAt: null,
  createdAt: new Date("2026-06-23T12:00:00.000Z"),
  updatedAt: new Date("2026-06-23T12:00:00.000Z"),
};

describe("toP2PListingDto", () => {
  it("serializes price to 7dp and dates to ISO", () => {
    const dto = toP2PListingDto(listingRow);
    expect(dto.price.amount).toBe("2.5000000");
    expect(dto.status).toBe("ACTIVE");
    expect(dto.lockedAt).toBeNull();
    expect(dto.createdAt).toBe("2026-06-23T12:00:00.000Z");
  });
});

const tradeRow = {
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
};

describe("toP2PTradeDto", () => {
  it("serializes all monetary fields", () => {
    const dto = toP2PTradeDto(tradeRow);
    expect(dto.price).toBe("2.5000000");
    expect(dto.platformFeeAmount).toBe("0.1250000");
    expect(dto.netToSellerAmount).toBe("2.3750000");
    expect(dto.status).toBe("ESCROW_PENDING");
  });
});
