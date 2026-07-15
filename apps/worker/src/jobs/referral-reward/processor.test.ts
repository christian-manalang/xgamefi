import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";
import { randomUUID } from "node:crypto";

const sendPayment = vi.hoisted(() => vi.fn(async () => ({ txHash: "REWARD_TX" })));
vi.mock("@xgamefi/shared/stellar", () => ({ sendPayment }));

import { referralRewardProcessor } from "./processor";

describe("referralRewardProcessor", () => {
  let referrerId: string;
  let inviteeId: string;
  let studioId: string;
  let itemId: string;
  let orderId: string;
  let referralId: string;

  beforeEach(async () => {
    sendPayment.mockClear();
    referrerId = randomUUID();
    inviteeId = randomUUID();
    studioId = randomUUID();
    itemId = randomUUID();
    orderId = randomUUID();
    referralId = randomUUID();

    await prisma.player.createMany({ data: [
      { id: referrerId, walletAddress: `G${referrerId.replace(/-/g, "").slice(0, 20)}` },
      { id: inviteeId, walletAddress: `G${inviteeId.replace(/-/g, "").slice(0, 20)}` },
    ]});
    await prisma.studio.create({ data: { id: studioId, name: "G", slug: `g-${studioId.slice(0, 8)}`, payoutWalletAddress: "GP", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" } });
    await prisma.item.create({ data: { id: itemId, studioId, externalId: "x", name: "X", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true } });
    await prisma.order.create({ data: {
      id: orderId, studioId, itemId, playerId: inviteeId, quantity: 1, currency: "USDT",
      grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
      platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
      idempotencyKey: `ord-${orderId}`, paymentStatus: "PAID", deliveryStatus: "DELIVERED",
    }});
    await prisma.referral.create({ data: {
      id: referralId, code: `REF-${referralId.slice(0, 8)}`, referrerPlayerId: referrerId, refereePlayerId: inviteeId,
      status: "QUALIFIED", qualifyingOrderId: orderId, qualifiedAt: new Date(),
    }});
  });

  it("pays the referrer, ledgers REFERRAL_REWARD, sets status REWARDED", async () => {
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("REWARDED");
    expect(res.txHash).toBe("REWARD_TX");
    expect(sendPayment).toHaveBeenCalledTimes(1);
    const ref = await prisma.referral.findUnique({ where: { id: referralId } });
    expect(ref?.status).toBe("REWARDED");
    expect(ref?.rewardTxHash).toBe("REWARD_TX");
    const ledger = await prisma.ledgerEntry.findFirst({ where: { type: "REFERRAL_REWARD", referralId } });
    expect(ledger).toBeTruthy();
    expect(ledger?.stellarTxHash).toBe("REWARD_TX");
  });

  it("is idempotent: a second run skips and does NOT pay again", async () => {
    await referralRewardProcessor({ data: { referralId } });
    sendPayment.mockClear();
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
    expect(await prisma.ledgerEntry.count({ where: { referralId } })).toBe(1);
  });

  it("skips a non-QUALIFIED referral (PENDING) without paying", async () => {
    const pendingId = randomUUID();
    await prisma.referral.create({ data: { id: pendingId, code: "PENDING1", referrerPlayerId: referrerId, refereePlayerId: null, status: "PENDING" } });
    const res = await referralRewardProcessor({ data: { referralId: pendingId } });
    expect(res.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
  });

  it("uses the studio-configured reward over the env default", async () => {
    await prisma.studio.update({
      where: { id: studioId },
      data: { referralRewardAmount: new Prisma.Decimal("2.5"), referralRewardCurrency: "XLM" },
    });
    await prisma.referral.update({ where: { id: referralId }, data: { studioId } });
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("REWARDED");
    expect(sendPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "2.5000000", asset: { code: "XLM" } })
    );
    const ref = await prisma.referral.findUnique({ where: { id: referralId } });
    expect(ref?.rewardAmount?.toString()).toBe("2.5");
    expect(ref?.rewardCurrency).toBe("XLM");
  });

  it("skips payout when studio has disabled rewards (amount = 0)", async () => {
    await prisma.studio.update({
      where: { id: studioId },
      data: { referralRewardAmount: new Prisma.Decimal("0"), referralRewardCurrency: "XLM" },
    });
    await prisma.referral.update({ where: { id: referralId }, data: { studioId } });
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
    const ref = await prisma.referral.findUnique({ where: { id: referralId } });
    expect(ref?.status).toBe("REWARDED");
    expect(ref?.rewardAmount?.toString()).toBe("0");
    expect(await prisma.ledgerEntry.count({ where: { referralId } })).toBe(0);
  });

  it("falls back to env when studio has no override (null)", async () => {
    await prisma.referral.update({ where: { id: referralId }, data: { studioId } });
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("REWARDED");
    expect(sendPayment).toHaveBeenCalledTimes(1);
  });
});
