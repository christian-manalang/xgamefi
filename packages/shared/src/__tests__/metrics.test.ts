import { describe, it, expect, beforeEach } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";
import { computePlatformMetrics, computeStudioMetrics } from "../metrics";
import { toAdminMetricsDto, toStudioMetricsDto } from "../dto/admin";

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

describe("studio metrics", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Session", "AuthChallenge", "Order", "Promotion", "ItemOwnership", "P2PTrade", "P2PListing", "WebhookDelivery", "ApiKey", "Item", "Player", "Referral", "Shop", "User", "Studio", "LedgerEntry", "IdempotencyKey", "AuditLog" RESTART IDENTITY CASCADE;`,
    );
  });

  it("scopes GMV, fees, orders and recent orders to the studio", async () => {
    const { studio, item, player } = await seedStudioWithItem();
    await prisma.order.create({
      data: {
        studioId: studio.id,
        itemId: item.id,
        playerId: player.id,
        quantity: 1,
        currency: "USDT",
        grossAmount: new Prisma.Decimal("2"),
        discountAmount: new Prisma.Decimal("0"),
        platformFeeAmount: new Prisma.Decimal("0.1"),
        netToStudioAmount: new Prisma.Decimal("1.9"),
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
        grossAmount: new Prisma.Decimal("8"),
        discountAmount: new Prisma.Decimal("0"),
        platformFeeAmount: new Prisma.Decimal("0.4"),
        netToStudioAmount: new Prisma.Decimal("7.6"),
        idempotencyKey: "k-pending",
        paymentStatus: "PENDING",
        deliveryStatus: "PENDING",
      },
    });

    const m = await computeStudioMetrics(studio.id);
    expect(m.gmv.toString()).toBe("2");
    expect(m.feesCollected.toString()).toBe("0.1");
    expect(m.orderCount).toBe(2);
    expect(m.recentOrders.length).toBe(2);

    const dto = toStudioMetricsDto(m);
    expect(dto.gmv).toBe("2.0000000");
    expect(dto.feesCollected).toBe("0.1000000");
    expect(dto.orderCount).toBe(2);
  });

  it("calculates webhook delivery health", async () => {
    const { studio } = await seedStudioWithItem();
    await prisma.webhookDelivery.createMany({
      data: [
        { studioId: studio.id, event: "purchase_completed", url: "https://example.com/hook", payload: {}, signature: "sig1", status: "DELIVERED", maxAttempts: 3 },
        { studioId: studio.id, event: "purchase_completed", url: "https://example.com/hook", payload: {}, signature: "sig2", status: "DELIVERED", maxAttempts: 3 },
        { studioId: studio.id, event: "purchase_completed", url: "https://example.com/hook", payload: {}, signature: "sig3", status: "FAILED", maxAttempts: 3 },
        { studioId: studio.id, event: "purchase_completed", url: "https://example.com/hook", payload: {}, signature: "sig4", status: "EXHAUSTED", maxAttempts: 3 },
      ],
    });

    const m = await computeStudioMetrics(studio.id);
    expect(m.webhookHealth.total).toBe(4);
    expect(m.webhookHealth.delivered).toBe(2);
    expect(m.webhookHealth.failed).toBe(2);
    expect(m.webhookHealth.successRate).toBe(50);

    const dto = toStudioMetricsDto(m);
    expect(dto.webhookHealth.successRate).toBe(50);
  });

  it("returns 100% webhook health when there are no deliveries", async () => {
    const { studio } = await seedStudioWithItem();
    const m = await computeStudioMetrics(studio.id);
    expect(m.webhookHealth.successRate).toBe(100);
    expect(m.webhookHealth.total).toBe(0);
  });
});
