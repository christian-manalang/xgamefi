import { prisma, Prisma } from "@xgamefi/db";
import { sendPayment } from "@xgamefi/shared/stellar";
import { toStellarAmount } from "@xgamefi/shared/money";
import { env } from "@xgamefi/config/env";

export interface ReferralRewardJobData {
  referralId: string;
}

type Asset = { code: "XLM" } | { code: string; issuer: string };

function assetFor(currency: string): Asset {
  if (currency === "XLM") return { code: "XLM" };
  return { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };
}

export async function referralRewardProcessor(
  job: { data: ReferralRewardJobData },
): Promise<{ status: "REWARDED" | "SKIPPED"; txHash?: string }> {
  const { referralId } = job.data;

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
  });
  if (!referral || referral.status !== "QUALIFIED") return { status: "SKIPPED" };

  const referrer = await prisma.player.findUnique({ where: { id: referral.referrerPlayerId } });
  if (!referrer) return { status: "SKIPPED" };

  const qualifyingOrder = referral.qualifyingOrderId
    ? await prisma.order.findUnique({ where: { id: referral.qualifyingOrderId } })
    : null;

  const studio = referral.studioId
    ? await prisma.studio.findUnique({ where: { id: referral.studioId } })
    : null;

  // Studio override wins over env. null = fall back to env; 0 = explicitly disabled.
  if (studio && studio.referralRewardAmount !== null && studio.referralRewardAmount.equals(0)) {
    await prisma.referral.update({
      where: { id: referralId },
      data: { status: "REWARDED", rewardAmount: new Prisma.Decimal(0), rewardedAt: new Date() },
    });
    return { status: "SKIPPED" };
  }

  const rewardAmount =
    studio && studio.referralRewardAmount !== null
      ? studio.referralRewardAmount
      : new Prisma.Decimal(env.REFERRAL_REWARD_AMOUNT);
  const rewardCurrency =
    (studio && studio.referralRewardCurrency) ||
    env.REFERRAL_REWARD_CURRENCY ||
    qualifyingOrder?.currency ||
    "XLM";
  const asset = assetFor(rewardCurrency);

  const { txHash } = await sendPayment({
    destination: referrer.walletAddress,
    asset,
    amount: toStellarAmount(rewardAmount),
    memo: `ref:${referralId.slice(0, 20)}`,
  });

  await prisma.$transaction(async (tx) => {
    const flipped = await tx.referral.updateMany({
      where: { id: referralId, status: "QUALIFIED" },
      data: {
        status: "REWARDED",
        rewardAmount,
        rewardCurrency,
        rewardTxHash: txHash,
        rewardedAt: new Date(),
      },
    });
    if (flipped.count === 0) return;
    await tx.ledgerEntry.create({
      data: {
        type: "REFERRAL_REWARD",
        referralId,
        stellarTxHash: txHash,
        sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
        destAddress: referrer.walletAddress,
        amount: rewardAmount,
        assetCode: rewardCurrency,
        assetIssuer: rewardCurrency === "XLM" ? null : env.STELLAR_USD_ASSET_ISSUER,
        status: "CONFIRMED",
      },
    });
  });

  return { status: "REWARDED", txHash };
}
