import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export type ItemCurrency = "XLM" | "USDT";

export type ItemRow = {
  id: string;
  studioId: string;
  externalId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceAmount: Prisma.Decimal;
  priceCurrency: ItemCurrency;
  stock: number | null;
  rarity: string | null;
  category: string | null;
  metadata: Prisma.JsonValue | null;
  isActive: boolean;
  isListed: boolean;
  syncedAt: Date | null;
};

export type ItemDto = {
  id: string;
  studioId: string;
  externalId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: { amount: string; currency: ItemCurrency };
  stock: number | null;
  rarity: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  isListed: boolean;
  syncedAt: string | null;
};

export function toItemDto(row: ItemRow): ItemDto {
  return {
    id: row.id,
    studioId: row.studioId,
    externalId: row.externalId,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    price: { amount: toStellarAmount(row.priceAmount), currency: row.priceCurrency },
    stock: row.stock,
    rarity: row.rarity,
    category: row.category,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    isActive: row.isActive,
    isListed: row.isListed,
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
  };
}
