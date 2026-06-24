import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toReferralDto, toReferralPerformanceDto } from "./referral";

describe("toReferralDto", () => {
  it("maps a referral row, formatting reward to 7dp when present", () => {
    const dto = toReferralDto({
      id: "r1", code: "ABC123", referrerPlayerId: "pl1", refereePlayerId: "pl2",
      status: "REWARDED", rewardAmount: new Prisma.Decimal("0.5"), rewardCurrency: "USDT",
      rewardTxHash: "tx", createdAt: new Date("2026-06-23T00:00:00Z"),
      qualifiedAt: new Date("2026-06-23T01:00:00Z"), rewardedAt: new Date("2026-06-23T02:00:00Z"),
    });
    expect(dto.code).toBe("ABC123");
    expect(dto.status).toBe("REWARDED");
    expect(dto.rewardAmount).toBe("0.5000000");
    expect(dto.rewardTxHash).toBe("tx");
  });

  it("leaves rewardAmount null when unset", () => {
    const dto = toReferralDto({
      id: "r1", code: "ABC123", referrerPlayerId: "pl1", refereePlayerId: null,
      status: "PENDING", rewardAmount: null, rewardCurrency: null, rewardTxHash: null,
      createdAt: new Date("2026-06-23T00:00:00Z"), qualifiedAt: null, rewardedAt: null,
    });
    expect(dto.rewardAmount).toBeNull();
    expect(dto.status).toBe("PENDING");
  });
});

describe("toReferralPerformanceDto", () => {
  it("aggregates counts and total rewards", () => {
    const dto = toReferralPerformanceDto({
      code: "ABC123",
      total: 5, qualified: 2, rewarded: 1,
      totalRewardAmount: new Prisma.Decimal("0.5"), rewardCurrency: "USDT",
    });
    expect(dto).toEqual({
      code: "ABC123", total: 5, qualified: 2, rewarded: 1,
      totalRewardAmount: "0.5000000", rewardCurrency: "USDT",
    });
  });
});
