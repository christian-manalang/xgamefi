import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export interface ReferralDto {
  id: string;
  code: string;
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED";
  refereePlayerId: string | null;
  rewardAmount: string | null;
  rewardCurrency: string | null;
  rewardTxHash: string | null;
  createdAt: string;
  qualifiedAt: string | null;
  rewardedAt: string | null;
}

interface ReferralRow {
  id: string; code: string; referrerPlayerId: string; refereePlayerId: string | null;
  status: ReferralDto["status"]; rewardAmount: Prisma.Decimal | null; rewardCurrency: string | null;
  rewardTxHash: string | null; createdAt: Date; qualifiedAt: Date | null; rewardedAt: Date | null;
}

export function toReferralDto(row: ReferralRow): ReferralDto {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    refereePlayerId: row.refereePlayerId,
    rewardAmount: row.rewardAmount ? toStellarAmount(row.rewardAmount) : null,
    rewardCurrency: row.rewardCurrency,
    rewardTxHash: row.rewardTxHash,
    createdAt: row.createdAt.toISOString(),
    qualifiedAt: row.qualifiedAt ? row.qualifiedAt.toISOString() : null,
    rewardedAt: row.rewardedAt ? row.rewardedAt.toISOString() : null,
  };
}

export interface ReferralPerformanceDto {
  code: string;
  total: number;
  qualified: number;
  rewarded: number;
  totalRewardAmount: string;
  rewardCurrency: string | null;
}

export function toReferralPerformanceDto(args: {
  code: string; total: number; qualified: number; rewarded: number;
  totalRewardAmount: Prisma.Decimal; rewardCurrency: string | null;
}): ReferralPerformanceDto {
  return {
    code: args.code,
    total: args.total,
    qualified: args.qualified,
    rewarded: args.rewarded,
    totalRewardAmount: toStellarAmount(args.totalRewardAmount),
    rewardCurrency: args.rewardCurrency,
  };
}
