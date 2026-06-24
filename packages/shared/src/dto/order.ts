import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export type OrderCurrency = "XLM" | "USDT";
export type OrderPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type OrderDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export type OrderRow = {
  id: string;
  studioId: string;
  itemId: string;
  playerId: string;
  quantity: number;
  currency: OrderCurrency;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  platformFeeAmount: Prisma.Decimal;
  netToStudioAmount: Prisma.Decimal;
  promotionId: string | null;
  referralCodeUsed: string | null;
  idempotencyKey: string;
  stellarTxHash: string | null;
  paymentStatus: OrderPaymentStatus;
  deliveryStatus: OrderDeliveryStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderDto = {
  id: string;
  studioId: string;
  itemId: string;
  playerId: string;
  quantity: number;
  currency: OrderCurrency;
  grossAmount: string;
  discountAmount: string;
  platformFeeAmount: string;
  netToStudioAmount: string;
  promotionId: string | null;
  referralCodeUsed: string | null;
  paymentStatus: OrderPaymentStatus;
  deliveryStatus: OrderDeliveryStatus;
  stellarTxHash: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export function toOrderDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    studioId: row.studioId,
    itemId: row.itemId,
    playerId: row.playerId,
    quantity: row.quantity,
    currency: row.currency,
    grossAmount: toStellarAmount(row.grossAmount),
    discountAmount: toStellarAmount(row.discountAmount),
    platformFeeAmount: toStellarAmount(row.platformFeeAmount),
    netToStudioAmount: toStellarAmount(row.netToStudioAmount),
    promotionId: row.promotionId ?? null,
    referralCodeUsed: row.referralCodeUsed ?? null,
    paymentStatus: row.paymentStatus,
    deliveryStatus: row.deliveryStatus,
    stellarTxHash: row.stellarTxHash,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
