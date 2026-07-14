import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http";

vi.mock("@xgamefi/shared/stellar", () => ({
  buildPaymentXdr: vi.fn(async () => "xdr"),
}));

import { createOrderQuote } from "./checkout-queries";

let STUDIO: string;
let ITEM: string;
let PLAYER: string;

async function wipe() {
  await prisma.order.deleteMany({ where: { idempotencyKey: { startsWith: "quote:" } } });
  await prisma.promotion.deleteMany({ where: { studioId: STUDIO } });
  await prisma.item.deleteMany({ where: { id: ITEM } });
  await prisma.studio.deleteMany({ where: { id: STUDIO } });
  await prisma.player.deleteMany({ where: { id: PLAYER } });
}

beforeEach(async () => {
  STUDIO = randomUUID();
  ITEM = randomUUID();
  PLAYER = randomUUID();
  await prisma.studio.create({
    data: { id: STUDIO, name: "G", slug: `g-${STUDIO.slice(0, 8)}`, payoutWalletAddress: "GDEST", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
  });
  await prisma.item.create({
    data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true, isListed: true },
  });
  await prisma.player.create({ data: { id: PLAYER, walletAddress: `G${PLAYER.replace(/-/g, "").slice(0, 20)}` } });
});

afterEach(wipe);

async function expectHttpError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toSatisfy((err: HttpError) => err.status === status && err.message === code);
}

describe("createOrderQuote", () => {
  it("creates a pending order with the Stellar memo bound to the order id", async () => {
    const res = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    expect(res.order.id).toBeTruthy();
    expect(res.quote.memo).toBe(res.order.id);
    expect(res.quote.destination).toBe(env.STELLAR_RECEIVING_ACCOUNT);
    const persisted = await prisma.order.findUnique({ where: { id: res.order.id } });
    expect(persisted?.paymentStatus).toBe("PENDING");
    expect(persisted?.playerId).toBe(PLAYER);
  });

  it("rejects an inactive studio", async () => {
    await prisma.studio.update({ where: { id: STUDIO }, data: { status: "PENDING" } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 }), 400, "STUDIO_INACTIVE");
  });

  it("rejects an unlisted item", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { isListed: false } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 }), 400, "ITEM_UNAVAILABLE");
  });

  it("rejects an inactive item", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { isActive: false } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 }), 400, "ITEM_UNAVAILABLE");
  });

  it("rejects a purchase that exceeds synced stock", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { stock: 3 } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 5 }), 400, "INSUFFICIENT_STOCK");
  });

  it("allows a purchase within synced stock", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { stock: 5 } });
    const res = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 5 });
    expect(res.order.quantity).toBe(5);
  });

  it("reuses an existing pending order for the same player, item, quantity, and currency", async () => {
    const first = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    const second = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    expect(second.order.id).toBe(first.order.id);

    const orders = await prisma.order.findMany({ where: { playerId: PLAYER, itemId: ITEM } });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.paymentStatus).toBe("PENDING");
  });

  it("creates a new order when currency differs from an existing pending order", async () => {
    const first = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1, currency: "USDT" });
    const second = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1, currency: "XLM" });
    expect(second.order.id).not.toBe(first.order.id);
  });

  it("cleans up older duplicate pending orders when reusing the latest one", async () => {
    // Simulate pre-existing duplicates (e.g., from a race or before the dedup fix).
    const older = await prisma.order.create({
      data: {
        studioId: STUDIO,
        itemId: ITEM,
        playerId: PLAYER,
        quantity: 1,
        currency: "USDT",
        grossAmount: new Prisma.Decimal("1"),
        discountAmount: new Prisma.Decimal("0"),
        platformFeeAmount: new Prisma.Decimal("0.05"),
        netToStudioAmount: new Prisma.Decimal("0.95"),
        idempotencyKey: "quote:dup:1",
        paymentStatus: "PENDING",
        deliveryStatus: "PENDING",
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    const newer = await prisma.order.create({
      data: {
        studioId: STUDIO,
        itemId: ITEM,
        playerId: PLAYER,
        quantity: 1,
        currency: "USDT",
        grossAmount: new Prisma.Decimal("1"),
        discountAmount: new Prisma.Decimal("0"),
        platformFeeAmount: new Prisma.Decimal("0.05"),
        netToStudioAmount: new Prisma.Decimal("0.95"),
        idempotencyKey: "quote:dup:2",
        paymentStatus: "PENDING",
        deliveryStatus: "PENDING",
      },
    });

    const result = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1, currency: "USDT" });
    expect(result.order.id).toBe(newer.id);

    const remaining = await prisma.order.findMany({ where: { playerId: PLAYER, itemId: ITEM } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(newer.id);
    expect(remaining[0]?.paymentStatus).toBe("PENDING");
  });

  it("applies a code-gated promotion when promotionCode matches", async () => {
    await prisma.promotion.create({
      data: {
        studioId: STUDIO,
        name: "Summer",
        code: "SUMMER10",
        type: "PERCENT",
        value: new Prisma.Decimal("10"),
        appliesToItemIds: [],
        usageCount: 0,
        isActive: true,
      },
    });
    const res = await createOrderQuote({
      playerId: PLAYER,
      itemId: ITEM,
      quantity: 1,
      promotionCode: "SUMMER10",
    });
    expect(res.order.discountAmount).toBe("0.1000000");
    expect(res.order.promotionId).toBeTruthy();
  });

  it("rejects an invalid promotionCode with INVALID_PROMOTION_CODE", async () => {
    await expectHttpError(
      createOrderQuote({
        playerId: PLAYER,
        itemId: ITEM,
        quantity: 1,
        promotionCode: "NOTREAL",
      }),
      400,
      "INVALID_PROMOTION_CODE",
    );
  });

  it("does NOT auto-apply a code-gated promotion when no code is provided", async () => {
    await prisma.promotion.create({
      data: {
        studioId: STUDIO,
        name: "Summer",
        code: "SUMMER10",
        type: "PERCENT",
        value: new Prisma.Decimal("10"),
        appliesToItemIds: [],
        usageCount: 0,
        isActive: true,
      },
    });
    const res = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    expect(res.order.discountAmount).toBe("0.0000000");
    expect(res.order.promotionId).toBeNull();
  });

  it("auto-apply (code-less) promotion still applies without a code", async () => {
    await prisma.promotion.create({
      data: {
        studioId: STUDIO,
        name: "Launch",
        code: null,
        type: "PERCENT",
        value: new Prisma.Decimal("10"),
        appliesToItemIds: [],
        usageCount: 0,
        isActive: true,
      },
    });
    const res = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    expect(res.order.discountAmount).toBe("0.1000000");
    expect(res.order.promotionId).toBeTruthy();
  });

  it("re-quotes fresh when promotionCode is provided on an existing pending order", async () => {
    const first = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    expect(first.order.discountAmount).toBe("0.0000000");

    await prisma.promotion.create({
      data: {
        studioId: STUDIO,
        name: "Summer",
        code: "SUMMER10",
        type: "PERCENT",
        value: new Prisma.Decimal("10"),
        appliesToItemIds: [],
        usageCount: 0,
        isActive: true,
      },
    });

    const second = await createOrderQuote({
      playerId: PLAYER,
      itemId: ITEM,
      quantity: 1,
      promotionCode: "SUMMER10",
    });
    expect(second.order.id).not.toBe(first.order.id);
    expect(second.order.discountAmount).toBe("0.1000000");
  });
});
