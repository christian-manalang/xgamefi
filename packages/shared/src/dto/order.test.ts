import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toOrderDto } from "./order";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  studioId: "22222222-2222-2222-2222-222222222222",
  itemId: "33333333-3333-3333-3333-333333333333",
  playerId: "44444444-4444-4444-4444-444444444444",
  quantity: 1,
  currency: "USDT" as const,
  grossAmount: new Prisma.Decimal("1"),
  discountAmount: new Prisma.Decimal("0"),
  platformFeeAmount: new Prisma.Decimal("0.05"),
  netToStudioAmount: new Prisma.Decimal("0.95"),
  promotionId: null,
  referralCodeUsed: null,
  idempotencyKey: "idem-1",
  stellarTxHash: null,
  paymentStatus: "PENDING" as const,
  deliveryStatus: "PENDING" as const,
  paidAt: null,
  deliveredAt: null,
  createdAt: new Date("2026-06-23T12:00:00.000Z"),
  updatedAt: new Date("2026-06-23T12:00:00.000Z"),
};

describe("toOrderDto", () => {
  it("serializes amounts to 7dp and dates to ISO", () => {
    const dto = toOrderDto(base);
    expect(dto.grossAmount).toBe("1.0000000");
    expect(dto.platformFeeAmount).toBe("0.0500000");
    expect(dto.netToStudioAmount).toBe("0.9500000");
    expect(dto.paymentStatus).toBe("PENDING");
    expect(dto.paidAt).toBeNull();
    expect(dto.createdAt).toBe("2026-06-23T12:00:00.000Z");
  });

  it("never leaks raw Decimal or Date fields", () => {
    const dto = toOrderDto(base) as Record<string, unknown>;
    expect(dto.grossAmount).toBe("1.0000000");
    expect(dto["grossAmount" as never]).not.toBeInstanceOf(Prisma.Decimal);
    expect((dto as { updatedAt?: unknown }).updatedAt).toBeUndefined();
  });
});
