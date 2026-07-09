import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyPayment, type Asset } from "./stellar";
import { getQueue } from "./queues";
import { publishOrderEvent } from "./order-events";

export type VerifyAdvanceResult =
  | { status: "PAID"; orderId: string; referralId?: string }
  | { status: "ALREADY"; orderId: string }
  | { status: "REJECTED"; reason: string };

export async function verifyAndAdvanceOrder(args: {
  orderId: string;
  txHash: string;
}): Promise<VerifyAdvanceResult> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      include: { item: true, studio: true },
    });
    if (!order) throw new Error(`verifyAndAdvanceOrder: order ${args.orderId} not found`);

    if (order.paymentStatus === "PAID") {
      return { status: "ALREADY", orderId: order.id } as VerifyAdvanceResult;
    }

    const expectedAsset: Asset =
      order.currency === "XLM"
        ? { code: "XLM" }
        : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

    const expectedAmount = order.grossAmount.minus(order.discountAmount);
    const verify = await verifyPayment({
      txHash: args.txHash,
      expectedDestination: env.STELLAR_RECEIVING_ACCOUNT,
      expectedAsset,
      minAmount: expectedAmount,
      expectedMemo: order.id,
    });

    if (!verify.ok) {
      return { status: "REJECTED", reason: verify.reason } as VerifyAdvanceResult;
    }

    const existing = await tx.order.findUnique({ where: { stellarTxHash: args.txHash } });
    if (existing && existing.id !== order.id) {
      return { status: "REJECTED", reason: "txHash already used" } as VerifyAdvanceResult;
    }

    const now = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        stellarTxHash: args.txHash,
        paidAt: now,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        type: "SALE_IN",
        orderId: order.id,
        stellarTxHash: args.txHash,
        sourceAddress: "",
        destAddress: env.STELLAR_RECEIVING_ACCOUNT,
        amount: order.grossAmount,
        assetCode: expectedAsset.code,
        assetIssuer: "issuer" in expectedAsset ? expectedAsset.issuer : null,
        status: "CONFIRMED",
      },
    });

    // Referral qualification — only on the invitee's FIRST qualifying (PAID) purchase.
    // This branch runs only on the first PAID transition, so it is inherently once-per-order.
    let referralId: string | undefined;
    const priorPaid = await tx.order.count({
      where: { playerId: order.playerId, paymentStatus: "PAID", id: { not: order.id } },
    });
    if (priorPaid === 0) {
      const pendingReferral = await tx.referral.findFirst({
        where: { refereePlayerId: order.playerId, status: "PENDING" },
      });
      if (pendingReferral) {
        const flipped = await tx.referral.updateMany({
          where: { id: pendingReferral.id, status: "PENDING" },
          data: {
            status: "QUALIFIED",
            qualifyingOrderId: order.id,
            qualifiedAt: now,
            studioId: order.studioId,
          },
        });
        if (flipped.count === 1) {
          referralId = pendingReferral.id;
        }
      }
    }

    return { status: "PAID", orderId: order.id, referralId } as VerifyAdvanceResult;
  });

  if (result.status === "PAID") {
    await getQueue("payout").add("payout", { orderId: result.orderId }, { jobId: `payout-${result.orderId}` });
    await getQueue("webhook-delivery").add(
      "webhook-delivery",
      { orderId: result.orderId },
      { jobId: `webhook-${result.orderId}` },
    );
    if (result.referralId) {
      await getQueue("referral-reward").add(
        "referral-reward",
        { referralId: result.referralId },
        { jobId: `referral-reward-${result.referralId}` },
      );
    }
    await publishOrderEvent(args.orderId, { paymentStatus: "PAID" }).catch((err) =>
      console.error(`verifyAndAdvanceOrder: failed to publish event for ${args.orderId}`, err),
    );
  }

  return result;
}
