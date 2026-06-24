import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export type P2PListingStatus = "ACTIVE" | "LOCKED" | "SOLD" | "CANCELLED";
export type P2PTradeStatus = "ESCROW_PENDING" | "PAID" | "ITEM_TRANSFERRED" | "COMPLETED" | "REFUNDED" | "FAILED";
export type P2PCurrency = "XLM" | "USDT";

export type P2PListingRow = {
  id: string;
  studioId: string;
  itemId: string;
  sellerPlayerId: string;
  price: Prisma.Decimal;
  currency: P2PCurrency;
  status: P2PListingStatus;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type P2PListingDto = {
  id: string;
  studioId: string;
  itemId: string;
  sellerPlayerId: string;
  price: { amount: string; currency: P2PCurrency };
  status: P2PListingStatus;
  lockedAt: string | null;
  createdAt: string;
};

export function toP2PListingDto(row: P2PListingRow): P2PListingDto {
  return {
    id: row.id,
    studioId: row.studioId,
    itemId: row.itemId,
    sellerPlayerId: row.sellerPlayerId,
    price: { amount: toStellarAmount(row.price), currency: row.currency },
    status: row.status,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type P2PTradeRow = {
  id: string;
  listingId: string;
  buyerPlayerId: string;
  sellerPlayerId: string;
  price: Prisma.Decimal;
  currency: P2PCurrency;
  platformFeeAmount: Prisma.Decimal;
  netToSellerAmount: Prisma.Decimal;
  escrowTxHash: string | null;
  payoutTxHash: string | null;
  status: P2PTradeStatus;
  idempotencyKey: string;
  createdAt: Date;
  completedAt: Date | null;
};

export type P2PTradeDto = {
  id: string;
  listingId: string;
  buyerPlayerId: string;
  sellerPlayerId: string;
  price: string;
  currency: P2PCurrency;
  platformFeeAmount: string;
  netToSellerAmount: string;
  escrowTxHash: string | null;
  payoutTxHash: string | null;
  status: P2PTradeStatus;
  createdAt: string;
  completedAt: string | null;
};

export function toP2PTradeDto(row: P2PTradeRow): P2PTradeDto {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerPlayerId: row.buyerPlayerId,
    sellerPlayerId: row.sellerPlayerId,
    price: toStellarAmount(row.price),
    currency: row.currency,
    platformFeeAmount: toStellarAmount(row.platformFeeAmount),
    netToSellerAmount: toStellarAmount(row.netToSellerAmount),
    escrowTxHash: row.escrowTxHash,
    payoutTxHash: row.payoutTxHash,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
