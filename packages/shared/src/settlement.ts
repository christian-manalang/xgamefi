import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyPayment, type Asset } from "./stellar";
import { getQueue } from "./queues";

export type VerifyAdvanceResult =
  | { status: "PAID" }
  | { status: "ALREADY" }
  | { status: "REJECTED"; reason: string };

export async function verifyAndAdvanceOrder(args: {
  orderId: string;
  txHash: string;
}): Promise<VerifyAdvanceResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      include: { item: true, studio: true },
    });
    if (!order) throw new Error(`verifyAndAdvanceOrder: order ${args.orderId} not found`);

    if (order.paymentStatus === "PAID") {
      return { status: "ALREADY" };
    }

    const expectedAsset: Asset =
      order.currency === "XLM"
        ? { code: "XLM" }
        : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

    const verify = await verifyPayment({
      txHash: args.txHash,
      expectedDestination: env.STELLAR_RECEIVING_ACCOUNT,
      expectedAsset,
      minAmount: order.grossAmount,
      expectedMemo: order.id,
    });

    if (!verify.ok) {
      return { status: "REJECTED", reason: verify.reason };
    }

    const existing = await tx.order.findUnique({ where: { stellarTxHash: args.txHash } });
    if (existing && existing.id !== order.id) {
      return { status: "REJECTED", reason: "txHash already used" };
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

    await getQueue("payout").add("payout", { orderId: order.id }, { jobId: `payout-${order.id}` });
    await getQueue("webhook-delivery").add(
      "webhook-delivery",
      { orderId: order.id },
      { jobId: `webhook-${order.id}` },
    );

    return { status: "PAID" };
  });
}
