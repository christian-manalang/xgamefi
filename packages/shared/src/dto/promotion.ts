import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export interface PromotionDto {
  id: string;
  name: string;
  type: "PERCENT" | "FIXED" | "BUNDLE" | "FIRST_PURCHASE";
  value: string;
  currency: string | null;
  appliesToItemIds: string[];
  bundleConfig: unknown | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromotionRow {
  id: string; studioId: string; name: string;
  type: PromotionDto["type"]; value: Prisma.Decimal; currency: string | null;
  appliesToItemIds: string[]; bundleConfig: unknown | null;
  startsAt: Date | null; endsAt: Date | null;
  usageLimit: number | null; usageCount: number; isActive: boolean;
  createdAt: Date; updatedAt: Date;
}

export function toPromotionDto(row: PromotionRow): PromotionDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: toStellarAmount(row.value),
    currency: row.currency,
    appliesToItemIds: row.appliesToItemIds,
    bundleConfig: row.bundleConfig ?? null,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
