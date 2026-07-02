import { prisma, Prisma } from "@xgamefi/db";
import { sendPayment, type Asset } from "@xgamefi/shared/stellar";
import { toStellarAmount } from "@xgamefi/shared/money";
import { env } from "@xgamefi/config/env";

export type PayoutJobData = { orderId: string };

export async function payoutProcessor(job: { data: PayoutJobData }): Promise<{ txHash: string }> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { studio: true },
  });
  if (!order) throw new Error(`payout: order ${orderId} not found`);
  if (order.paymentStatus !== "PAID") throw new Error(`payout: order ${orderId} is not PAID`);
  if (!order.studio?.payoutWalletAddress) throw new Error(`payout: studio ${order.studioId} has no payout wallet`);

  const asset: Asset =
    order.currency === "XLM"
      ? { code: "XLM" }
      : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

  const amount = toStellarAmount(order.netToStudioAmount);
  const memo = `payout:${order.id}`;

  const { txHash } = await sendPayment({
    destination: order.studio.payoutWalletAddress,
    asset,
    amount,
    memo,
  });

  await prisma.ledgerEntry.create({
    data: {
      type: "PAYOUT_OUT",
      orderId: order.id,
      stellarTxHash: txHash,
      sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
      destAddress: order.studio.payoutWalletAddress,
      amount: order.netToStudioAmount,
      assetCode: asset.code,
      assetIssuer: "issuer" in asset ? asset.issuer : null,
      status: "CONFIRMED",
    },
  });

  return { txHash };
}
