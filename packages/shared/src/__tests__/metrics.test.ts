import { describe, it, expect, beforeEach } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";
import { computePlatformMetrics } from "../metrics";
import { toAdminMetricsDto } from "../dto/admin";

async function seedStudioWithItem() {
  const studio = await prisma.studio.create({
    data: {
      name: "S",
      slug: "s-" + Date.now(),
      status: "ACTIVE",
      platformFeeBps: 500,
    },
  });
  const item = await prisma.item.create({
    data: {
      studioId: studio.id,
      externalId: "i1",
      name: "Sword Skin",
      priceAmount: new Prisma.Decimal("1"),
      priceCurrency: "USDT",
      metadata: {},
    },
  });
  const player = await prisma.player.create({
    data: { walletAddress: "G" + "A".repeat(55) },
  });
  return { studio, item, player };
}

describe("platform metrics", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Session", "AuthChallenge", "Order", "Promotion", "ItemOwnership", "P2PTrade", "P2PListing", "WebhookDelivery", "ApiKey", "Item", "Player", "Referral", "Shop", "User", "Studio", "LedgerEntry", "IdempotencyKey", "AuditLog" RESTART IDENTITY CASCADE;`,
    );
  });

  it("sums GMV and fees only over PAID orders and counts active studios", async () => {
    const { studio, item, player } = await seedStudioWithItem();
    await prisma.order.create({
      data: {
        studioId: studio.id,
        itemId: item.id,
        playerId: player.id,
        quantity: 1,
        currency: "USDT",
        grossAmount: new Prisma.Decimal("1"),
        discountAmount: new Prisma.Decimal("0"),
        platformFeeAmount: new Prisma.Decimal("0.05"),
        netToStudioAmount: new Prisma.Decimal("0.95"),
        idempotencyKey: "k-paid",
        paymentStatus: "PAID",
        deliveryStatus: "DELIVERED",
      },
    });
    await prisma.order.create({
      data: {
        studioId: studio.id,
        itemId: item.id,
        playerId: player.id,
        quantity: 1,
        currency: "USDT",
        grossAmount: new Prisma.Decimal("9"),
        discountAmount: new Prisma.Decimal("0"),
        platformFeeAmount: new Prisma.Decimal("0.45"),
        netToStudioAmount: new Prisma.Decimal("8.55"),
        idempotencyKey: "k-pending",
        paymentStatus: "PENDING",
        deliveryStatus: "PENDING",
      },
    });

    const m = await computePlatformMetrics();
    expect(m.gmv.toString()).toBe("1");
    expect(m.feesCollected.toString()).toBe("0.05");
    expect(m.activeStudios).toBe(1);
    expect(m.recentOrders.length).toBe(2);

    const dto = toAdminMetricsDto(m);
    expect(dto.gmv).toBe("1.0000000");
    expect(dto.feesCollected).toBe("0.0500000");
  });
});
