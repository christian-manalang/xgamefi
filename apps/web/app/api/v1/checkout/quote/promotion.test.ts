import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { prisma, Prisma } from "@xgamefi/db";
import { randomUUID } from "node:crypto";

vi.mock("@/lib/auth/guards", () => ({
  requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: PLAYER, walletAddress: "GPLAYER" })),
}));

vi.mock("@xgamefi/shared/stellar", () => ({
  buildPaymentXdr: vi.fn(async () => "xdr"),
}));

let STUDIO: string;
let ITEM: string;
let PLAYER: string;

async function seed(promoType?: "PERCENT" | "FIRST_PURCHASE") {
  STUDIO = randomUUID();
  ITEM = randomUUID();
  PLAYER = randomUUID();
  await prisma.studio.create({ data: { id: STUDIO, name: "G", slug: `g-${STUDIO.slice(0, 8)}`, payoutWalletAddress: "GDEST", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" } });
  await prisma.item.create({ data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true } });
  await prisma.player.create({ data: { id: PLAYER, walletAddress: `G${PLAYER.replace(/-/g, "").slice(0, 20)}` } });
  if (promoType) {
    await prisma.promotion.create({ data: { studioId: STUDIO, name: "P", type: promoType, value: new Prisma.Decimal("10"), appliesToItemIds: [], usageCount: 0, isActive: true } });
  }
}

function quoteReq(overrides: Record<string, unknown> = {}) {
  return new Request("http://t/api/v1/checkout/quote", {
    method: "POST",
    body: JSON.stringify({ itemId: ITEM, quantity: 1, ...overrides }),
  });
}

describe("checkout/quote with promotions", () => {
  beforeEach(async () => {
    await prisma.order.deleteMany({ where: { idempotencyKey: { startsWith: "quote:" } } });
  });

  it("applies a 10% PERCENT promo: discount 0.1, fee on discounted 0.9", async () => {
    await seed("PERCENT");
    const res = await POST(quoteReq());
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.order.grossAmount).toBe("1.0000000");
    expect(b.order.discountAmount).toBe("0.1000000");
    expect(b.order.platformFeeAmount).toBe("0.0450000");
    expect(b.order.netToStudioAmount).toBe("0.8550000");
    expect(b.quote.amount).toBe("0.9000000");
    expect(b.order.promotionId).toBeTruthy();
    const promo = await prisma.promotion.findFirst({ where: { studioId: STUDIO } });
    expect(promo?.usageCount).toBe(1);
  });

  it("computes fee on full gross when no promo exists", async () => {
    await seed();
    const res = await POST(quoteReq());
    const b = await res.json();
    expect(b.order.discountAmount).toBe("0.0000000");
    expect(b.order.platformFeeAmount).toBe("0.0500000");
    expect(b.order.netToStudioAmount).toBe("0.9500000");
    expect(b.order.promotionId).toBeNull();
    expect(b.quote.amount).toBe("1.0000000");
  });

  it("FIRST_PURCHASE applies for a player with no prior PAID order", async () => {
    await seed("FIRST_PURCHASE");
    const res = await POST(quoteReq());
    const b = await res.json();
    expect(b.order.discountAmount).toBe("0.1000000");
  });

  it("FIRST_PURCHASE skipped when player already has a PAID order", async () => {
    await seed("FIRST_PURCHASE");
    await prisma.order.create({ data: {
      studioId: STUDIO, itemId: ITEM, playerId: PLAYER, quantity: 1, currency: "USDT",
      grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
      platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
      idempotencyKey: `prior-${PLAYER}`, paymentStatus: "PAID", deliveryStatus: "DELIVERED",
    }});
    const res = await POST(quoteReq());
    const b = await res.json();
    expect(b.order.discountAmount).toBe("0.0000000");
  });

  it("records referralCodeUsed on the order", async () => {
    await seed();
    const res = await POST(quoteReq({ referralCode: "ABC123" }));
    const b = await res.json();
    expect(b.order.referralCodeUsed).toBe("ABC123");
  });
});
