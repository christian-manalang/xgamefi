import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { sendPayment, type Asset } from "@xgamefi/shared/stellar";

export type RefundJobData = { kind?: "order" | "p2p"; orderId?: string; tradeId?: string };

function asset(currency: "XLM" | "USDT"): Asset {
  return currency === "XLM"
    ? { code: "XLM" }
    : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };
}

export async function refundProcessor(job: { data: RefundJobData }): Promise<{ status: string }> {
  const { orderId, tradeId } = job.data;

  // Branch on which entity is present (legacy callers enqueue { orderId } without kind).
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { player: true } });
    if (!order) throw new Error(`refund: order ${orderId} not found`);
    if (!order.player?.walletAddress) throw new Error(`refund: order ${orderId} buyer has no wallet`);

    const ast = asset(order.currency);
    const { txHash } = await sendPayment({
      destination: order.player.walletAddress,
      asset: ast,
      amount: order.grossAmount.toFixed(7),
      memo: `refund:${order.id}`,
    });

    await prisma.$transaction([
      prisma.ledgerEntry.create({
        data: {
          type: "REFUND",
          orderId: order.id,
          stellarTxHash: txHash,
          sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
          destAddress: order.player.walletAddress,
          amount: order.grossAmount,
          assetCode: ast.code,
          assetIssuer: "issuer" in ast ? ast.issuer : null,
          status: "CONFIRMED",
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } }),
    ]);

    return { status: "CONFIRMED" };
  }

  if (!tradeId) throw new Error("refund: neither orderId nor tradeId provided");

  const trade = await prisma.p2PTrade.findUnique({ where: { id: tradeId }, include: { buyer: true } });
  if (!trade) throw new Error(`refund: trade ${tradeId} not found`);
  if (!trade.buyer?.walletAddress) throw new Error(`refund: trade ${tradeId} buyer has no wallet`);

  const ast = asset(trade.currency);
  const { txHash } = await sendPayment({
    destination: trade.buyer.walletAddress,
    asset: ast,
    amount: trade.price.toFixed(7),
    memo: `refund:${trade.id}`,
  });

  await prisma.$transaction([
    prisma.ledgerEntry.create({
      data: {
        type: "REFUND",
        tradeId: trade.id,
        stellarTxHash: txHash,
        sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
        destAddress: trade.buyer.walletAddress,
        amount: trade.price,
        assetCode: ast.code,
        assetIssuer: "issuer" in ast ? ast.issuer : null,
        status: "CONFIRMED",
      },
    }),
    prisma.p2PTrade.update({ where: { id: trade.id }, data: { status: "REFUNDED" } }),
  ]);

  return { status: "CONFIRMED" };
}
