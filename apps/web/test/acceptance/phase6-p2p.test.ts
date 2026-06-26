import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const { verifyPayment, sendPayment, buildPaymentXdr, safeFetch, add } = vi.hoisted(() => ({
  verifyPayment: vi.fn(),
  sendPayment: vi.fn(async () => ({ txHash: "PAYOUT_TX" })),
  buildPaymentXdr: vi.fn(async () => "xdr"),
  safeFetch: vi.fn(),
  add: vi.fn(async () => {}),
}));

vi.mock("@xgamefi/shared/stellar", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/stellar")>();
  return { ...mod, verifyPayment, sendPayment, buildPaymentXdr };
});
vi.mock("@xgamefi/shared/ssrf", () => ({ safeFetch }));
vi.mock("@xgamefi/shared/queues", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/queues")>();
  return { ...mod, getQueue: vi.fn(() => ({ add })) };
});

import { createListing, createTradeQuote } from "@/lib/p2p-queries";
import { verifyAndAdvanceP2PTrade, transferItemAndPayout } from "@xgamefi/shared/p2p/settlement";

const STUDIO = "00000000-0000-0000-0000-000000000c01";
const ITEM = "00000000-0000-0000-0000-0000000000d1";
const SELLER = "00000000-0000-0000-0000-0000000000a1";
const BUYER = "00000000-0000-0000-0000-0000000000b1";

async function wipe() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.order.deleteMany();
  await prisma.p2PTrade.deleteMany();
  await prisma.itemOwnership.deleteMany();
  await prisma.p2PListing.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.item.deleteMany();
  await prisma.player.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.studio.deleteMany();
}

beforeEach(async () => {
  add.mockClear();
  verifyPayment.mockReset().mockResolvedValue({ ok: true, txHash: "ESCROW_TX", amount: new Prisma.Decimal("2.5"), memo: "m", asset: { code: "USDT", issuer: "GISS" } });
  sendPayment.mockClear();
  safeFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ quantity: 3, transferred: true }), { status: 200 }));
  await wipe();
  await prisma.studio.create({
    data: {
      id: STUDIO, name: "G", slug: "gridlock", payoutWalletAddress: "GP", webhookSecretHash: "secrethash",
      platformFeeBps: 500, status: "ACTIVE", apiBaseUrl: "https://api.gridlock.gg",
    },
  });
  await prisma.item.create({
    data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("2.5"), priceCurrency: "USDT", isActive: true },
  });
  await prisma.player.createMany({
    data: [
      { id: SELLER, walletAddress: "GSELLER" },
      { id: BUYER, walletAddress: "GBUYER" },
    ],
  });
  await prisma.itemOwnership.create({
    data: { playerId: SELLER, itemId: ITEM, studioId: STUDIO, quantity: 1, source: "P2P" },
  });
});

afterAll(wipe);

describe("Phase 6 acceptance: P2P list -> escrow -> transfer -> payout, all ledgered", () => {
  it("completes a P2P trade end-to-end with escrow + payout ledger entries", async () => {
    // 1) Seller lists the item (ownership verified via game API, ownership locked).
    const listing = await createListing({ sellerPlayerId: SELLER, itemId: ITEM, price: "2.5", currency: "USDT" });
    expect(listing.status).toBe("ACTIVE");

    // 2) Buyer quotes the trade: fee 5% of 2.5 = 0.125, net 2.375; listing locks.
    const quote = await createTradeQuote({ buyerPlayerId: BUYER, listingId: listing.id });
    expect(quote.trade.platformFeeAmount).toBe("0.1250000");
    expect(quote.trade.netToSellerAmount).toBe("2.3750000");
    expect(quote.quote.memo).toBe(quote.trade.id);
    const lockedListing = await prisma.p2PListing.findUnique({ where: { id: listing.id } });
    expect(lockedListing?.status).toBe("LOCKED");

    // 3) Escrow verification advances the trade to PAID + writes P2P_ESCROW_IN.
    const settle = await verifyAndAdvanceP2PTrade({ tradeId: quote.trade.id, txHash: "ESCROW_TX" });
    expect(settle.status).toBe("PAID");
    expect(add).toHaveBeenCalledWith("p2p-settlement", { tradeId: quote.trade.id, phase: "transfer" }, expect.anything());
    expect(await prisma.ledgerEntry.count({ where: { type: "P2P_ESCROW_IN", tradeId: quote.trade.id } })).toBe(1);

    // 4) Item transfer + seller payout completes the trade and ledgers P2P_PAYOUT.
    const transfer = await transferItemAndPayout({ tradeId: quote.trade.id });
    expect(transfer.status).toBe("COMPLETED");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GSELLER", amount: "2.3750000" }));
    expect(await prisma.ledgerEntry.count({ where: { type: "P2P_PAYOUT", tradeId: quote.trade.id } })).toBe(1);

    const finalTrade = await prisma.p2PTrade.findUnique({ where: { id: quote.trade.id } });
    expect(finalTrade?.status).toBe("COMPLETED");
    const soldListing = await prisma.p2PListing.findUnique({ where: { id: listing.id } });
    expect(soldListing?.status).toBe("SOLD");
    const buyerOwnership = await prisma.itemOwnership.findUnique({ where: { playerId_itemId: { playerId: BUYER, itemId: ITEM } } });
    expect(buyerOwnership?.quantity).toBe(1);

    // The completion webhook is enqueued.
    expect(add).toHaveBeenCalledWith("webhook-delivery", { tradeId: quote.trade.id, event: "p2p_trade_completed" }, expect.anything());
  });
});
