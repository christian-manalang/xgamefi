import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const { verifyPayment, sendPayment, safeFetch, add } = vi.hoisted(() => ({
  verifyPayment: vi.fn(),
  sendPayment: vi.fn(),
  safeFetch: vi.fn(),
  add: vi.fn(async () => {}),
}));

vi.mock("../stellar", () => ({ verifyPayment, sendPayment }));
vi.mock("../ssrf", () => ({ safeFetch }));
vi.mock("../queues", () => ({ getQueue: vi.fn(() => ({ add })) }));

import { verifyAndAdvanceP2PTrade, transferItemAndPayout } from "./settlement";

const STUDIO = "00000000-0000-0000-0000-000000000c01";
const ITEM = "00000000-0000-0000-0000-0000000000d1";
const SELLER = "00000000-0000-0000-0000-0000000000a1";
const BUYER = "00000000-0000-0000-0000-0000000000b1";
const LISTING = "00000000-0000-0000-0000-0000000000e1";
const TRADE = "00000000-0000-0000-0000-0000000000f1";

async function wipe() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.p2PTrade.deleteMany();
  await prisma.itemOwnership.deleteMany();
  await prisma.p2PListing.deleteMany();
  await prisma.item.deleteMany();
  await prisma.player.deleteMany();
  await prisma.studio.deleteMany();
}

async function seed(tradeStatus: "ESCROW_PENDING" | "PAID" = "ESCROW_PENDING") {
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
  await prisma.p2PListing.create({
    data: { id: LISTING, studioId: STUDIO, itemId: ITEM, sellerPlayerId: SELLER, price: new Prisma.Decimal("2.5"), currency: "USDT", status: "ACTIVE", lockedAt: new Date() },
  });
  await prisma.itemOwnership.create({
    data: { playerId: SELLER, itemId: ITEM, studioId: STUDIO, quantity: 1, source: "P2P", lockedForListingId: LISTING },
  });
  await prisma.p2PTrade.create({
    data: {
      id: TRADE, listingId: LISTING, buyerPlayerId: BUYER, sellerPlayerId: SELLER,
      price: new Prisma.Decimal("2.5"), currency: "USDT",
      platformFeeAmount: new Prisma.Decimal("0.125"), netToSellerAmount: new Prisma.Decimal("2.375"),
      status: tradeStatus, idempotencyKey: "trade-idem-1",
    },
  });
}

beforeEach(async () => {
  add.mockClear();
  verifyPayment.mockReset().mockResolvedValue({ ok: true, txHash: "tx1", amount: new Prisma.Decimal("2.5"), memo: TRADE, asset: { code: "USDT", issuer: "GISS" } });
  sendPayment.mockReset().mockResolvedValue({ txHash: "payout-tx" });
  safeFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ transferred: true }), { status: 200 }));
  await wipe();
});

afterAll(wipe);

describe("verifyAndAdvanceP2PTrade", () => {
  it("returns ALREADY when trade is not ESCROW_PENDING", async () => {
    await seed("PAID");
    const res = await verifyAndAdvanceP2PTrade({ tradeId: TRADE, txHash: "tx1" });
    expect(res.status).toBe("ALREADY");
  });

  it("returns PAID and writes P2P_ESCROW_IN + enqueues settlement on success", async () => {
    await seed();
    const res = await verifyAndAdvanceP2PTrade({ tradeId: TRADE, txHash: "escrow-tx" });
    expect(res.status).toBe("PAID");
    const trade = await prisma.p2PTrade.findUnique({ where: { id: TRADE } });
    expect(trade?.status).toBe("PAID");
    expect(trade?.escrowTxHash).toBe("escrow-tx");
    expect(await prisma.ledgerEntry.count({ where: { type: "P2P_ESCROW_IN", tradeId: TRADE } })).toBe(1);
    expect(add).toHaveBeenCalledWith("p2p-settlement", { tradeId: TRADE, phase: "transfer" }, expect.anything());
  });

  it("returns REJECTED on verification failure", async () => {
    await seed();
    verifyPayment.mockResolvedValue({ ok: false, reason: "amount below minimum" });
    const res = await verifyAndAdvanceP2PTrade({ tradeId: TRADE, txHash: "tx1" });
    expect(res.status).toBe("REJECTED");
  });
});

describe("transferItemAndPayout", () => {
  it("transfers item, pays seller, marks COMPLETED, moves ownership, sells listing", async () => {
    await seed("PAID");
    const res = await transferItemAndPayout({ tradeId: TRADE });
    expect(res.status).toBe("COMPLETED");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GSELLER", amount: "2.3750000" }));
    expect(await prisma.ledgerEntry.count({ where: { type: "P2P_PAYOUT", tradeId: TRADE } })).toBe(1);
    const trade = await prisma.p2PTrade.findUnique({ where: { id: TRADE } });
    expect(trade?.status).toBe("COMPLETED");
    const listing = await prisma.p2PListing.findUnique({ where: { id: LISTING } });
    expect(listing?.status).toBe("SOLD");
    const buyerOwn = await prisma.itemOwnership.findUnique({ where: { playerId_itemId: { playerId: BUYER, itemId: ITEM } } });
    expect(buyerOwn?.quantity).toBe(1);
    expect(add).toHaveBeenCalledWith("webhook-delivery", { tradeId: TRADE, event: "p2p_trade_completed" }, expect.anything());
  });

  it("on transfer failure: returns FAILED and enqueues refund", async () => {
    await seed("PAID");
    safeFetch.mockResolvedValue(new Response("nope", { status: 502 }));
    const res = await transferItemAndPayout({ tradeId: TRADE });
    expect(res.status).toBe("FAILED");
    expect(sendPayment).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith("refund", { tradeId: TRADE, kind: "p2p" }, expect.anything());
  });
});
