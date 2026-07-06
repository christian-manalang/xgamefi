import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const add = vi.fn(async (..._args: unknown[]) => {});
// settlement.ts imports getQueue from "./queues" — mock the relative specifier.
vi.mock("./queues", () => ({ getQueue: vi.fn(() => ({ add })) }));
// verifyPayment is stubbed to succeed (the on-chain check is Phase-3's own concern).
vi.mock("./stellar", () => ({
  verifyPayment: vi.fn(async () => ({
    ok: true,
    txHash: "TX1",
    amount: new Prisma.Decimal("1"),
    memo: "m",
    asset: { code: "USDT", issuer: "GISS" },
  })),
}));
vi.mock("./order-events", () => ({ publishOrderEvent: vi.fn(async () => {}) }));

import { verifyAndAdvanceOrder } from "./settlement";

const STUDIO = "00000000-0000-0000-0000-000000000001";
const ITEM = "00000000-0000-0000-0000-0000000000d1";
const REFERRER = "00000000-0000-0000-0000-0000000000a1";
const INVITEE = "00000000-0000-0000-0000-0000000000c1";

async function seed() {
  await prisma.player.createMany({
    data: [
      { id: REFERRER, walletAddress: "GREF" },
      { id: INVITEE, walletAddress: "GINV", referredByPlayerId: REFERRER },
    ],
  });
  await prisma.studio.create({
    data: { id: STUDIO, name: "G", slug: "g", payoutWalletAddress: "GP", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
  });
  await prisma.item.create({
    data: { id: ITEM, studioId: STUDIO, externalId: "x", name: "X", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true },
  });
  await prisma.referral.create({
    data: { code: "ABC123-c1", referrerPlayerId: REFERRER, refereePlayerId: INVITEE, status: "PENDING" },
  });
  const order = await prisma.order.create({
    data: {
      studioId: STUDIO, itemId: ITEM, playerId: INVITEE, quantity: 1, currency: "USDT",
      grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
      platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
      idempotencyKey: "ord1", paymentStatus: "PENDING", deliveryStatus: "PENDING",
    },
  });
  return order.id;
}

async function reset() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.order.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.item.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.studio.deleteMany();
  await prisma.player.deleteMany();
}

describe("verifyAndAdvanceOrder referral hook", () => {
  beforeEach(async () => {
    add.mockClear();
    await reset();
  });

  // Leave a clean DB for later test files (shared DB, sequential run).
  afterAll(reset);

  it("on first PAID: marks referral QUALIFIED and enqueues referral-reward", async () => {
    const orderId = await seed();
    const res = await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    expect(res.status).toBe("PAID");
    const ref = await prisma.referral.findFirst({ where: { refereePlayerId: INVITEE } });
    expect(ref?.status).toBe("QUALIFIED");
    expect(ref?.qualifyingOrderId).toBe(orderId);
    expect(ref?.studioId).toBe(STUDIO);
    expect(add).toHaveBeenCalledWith("referral-reward", { referralId: ref!.id }, expect.anything());
  });

  it("on a second PAID call (ALREADY): does not re-qualify or re-enqueue", async () => {
    const orderId = await seed();
    await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    add.mockClear();
    const res = await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    expect(res.status).toBe("ALREADY");
    const refRewardCalls = add.mock.calls.filter((c) => c[0] === "referral-reward");
    expect(refRewardCalls).toHaveLength(0);
  });

  it("no referral hook when the invitee was not referred", async () => {
    const orderId = await seed();
    await prisma.referral.deleteMany();
    await prisma.player.update({ where: { id: INVITEE }, data: { referredByPlayerId: null } });
    const res = await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    expect(res.status).toBe("PAID");
    const refRewardCalls = add.mock.calls.filter((c) => c[0] === "referral-reward");
    expect(refRewardCalls).toHaveLength(0);
  });
});
