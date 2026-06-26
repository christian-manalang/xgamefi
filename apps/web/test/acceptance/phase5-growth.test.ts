import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const STUDIO = "00000000-0000-0000-0000-000000000001";
const ITEM = "00000000-0000-0000-0000-0000000000d1";
const REFERRER = "00000000-0000-0000-0000-0000000000a1";
const INVITEE = "00000000-0000-0000-0000-0000000000c1";

// Hoisted so the vi.mock factories (themselves hoisted) can reference these.
const h = vi.hoisted(() => ({
  invitee: "00000000-0000-0000-0000-0000000000c1",
  sendPayment: vi.fn(async () => ({ txHash: "REWARD_TX" })),
  add: vi.fn(async () => {}),
}));
const sendPayment = h.sendPayment;
const add = h.add;

// Stub the on-chain surface: sale verification succeeds, reward payment + XDR build are stubbed.
vi.mock("@xgamefi/shared/stellar", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/stellar")>();
  const { Prisma } = await import("@xgamefi/db");
  return {
    ...mod,
    sendPayment: h.sendPayment,
    buildPaymentXdr: vi.fn(async () => "xdr"),
    verifyPayment: vi.fn(async () => ({
      ok: true,
      txHash: "SALE_TX",
      amount: new Prisma.Decimal("0.9"),
      memo: "m",
      asset: { code: "USDT", issuer: "GISS" },
    })),
  };
});

vi.mock("@xgamefi/shared/queues", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/queues")>();
  return { ...mod, getQueue: vi.fn(() => ({ add: h.add })) };
});

vi.mock("@/lib/auth/guards", () => ({
  requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: h.invitee, walletAddress: "GINV" })),
}));

import { POST as quote } from "../../app/api/v1/checkout/quote/route";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { referralRewardProcessor } from "../../../worker/src/jobs/referral-reward/processor";

async function wipe() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.order.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.item.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.studio.deleteMany();
  await prisma.player.deleteMany();
}

describe("Phase 5 acceptance: discounted order + auto referral payout", () => {
  // Leave a clean DB for later test files (shared DB, sequential run).
  afterAll(wipe);

  beforeEach(async () => {
    add.mockClear();
    sendPayment.mockClear();
    await wipe();
    await prisma.player.createMany({
      data: [
        { id: REFERRER, walletAddress: "GREFERRER" },
        { id: INVITEE, walletAddress: "GINV", referredByPlayerId: REFERRER },
      ],
    });
    await prisma.studio.create({
      data: { id: STUDIO, name: "G", slug: "gridlock", payoutWalletAddress: "GP", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
    });
    await prisma.item.create({
      data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true },
    });
    await prisma.promotion.create({
      data: { studioId: STUDIO, name: "Launch", type: "PERCENT", value: new Prisma.Decimal("10"), appliesToItemIds: [], usageCount: 0, isActive: true },
    });
    await prisma.referral.create({
      data: { code: "ABC123-c1", studioId: STUDIO, referrerPlayerId: REFERRER, refereePlayerId: INVITEE, status: "PENDING" },
    });
  });

  it("end-to-end: 10% discount applied server-side, referrer auto-paid, both ledgered", async () => {
    // 1) Quote applies the 10% promo: gross 1.0, discount 0.1, fee 5% of 0.9 = 0.045, net 0.855
    const qres = await quote(
      new Request("http://t/api/v1/checkout/quote", {
        method: "POST",
        body: JSON.stringify({ itemId: ITEM, quantity: 1 }),
      }),
    );
    expect(qres.status).toBe(200);
    const q = await qres.json();
    expect(q.order.discountAmount).toBe("0.1000000");
    expect(q.order.platformFeeAmount).toBe("0.0450000");
    expect(q.order.netToStudioAmount).toBe("0.8550000");
    expect(q.quote.amount).toBe("0.9000000");
    const order = await prisma.order.findFirst();
    expect(order?.discountAmount?.toFixed(7)).toBe("0.1000000");
    expect(order?.promotionId).toBeTruthy();

    // 2) Settle the order PAID -> qualifies referral + enqueues referral-reward + SALE_IN ledger
    const settle = await verifyAndAdvanceOrder({ orderId: order!.id, txHash: "SALE_TX" });
    expect(settle.status).toBe("PAID");
    const ref = await prisma.referral.findFirst({ where: { refereePlayerId: INVITEE } });
    expect(ref?.status).toBe("QUALIFIED");
    expect(add).toHaveBeenCalledWith("referral-reward", { referralId: ref!.id }, expect.anything());
    expect(await prisma.ledgerEntry.count({ where: { type: "SALE_IN", orderId: order!.id } })).toBe(1);

    // 3) Run the reward job -> referrer paid, REWARDED, REFERRAL_REWARD ledger
    const reward = await referralRewardProcessor({ data: { referralId: ref!.id } });
    expect(reward.status).toBe("REWARDED");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GREFERRER" }));
    const rewarded = await prisma.referral.findUnique({ where: { id: ref!.id } });
    expect(rewarded?.status).toBe("REWARDED");
    expect(await prisma.ledgerEntry.count({ where: { type: "REFERRAL_REWARD", referralId: ref!.id } })).toBe(1);

    // 4) Idempotency: re-running the reward job does not double-pay
    sendPayment.mockClear();
    const againRes = await referralRewardProcessor({ data: { referralId: ref!.id } });
    expect(againRes.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
    expect(await prisma.ledgerEntry.count({ where: { type: "REFERRAL_REWARD", referralId: ref!.id } })).toBe(1);
  });
});
