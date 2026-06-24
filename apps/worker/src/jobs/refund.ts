import { prisma } from "@xgamefi/db";

export type RefundJobData = { orderId: string };

export async function refundProcessor(job: { data: RefundJobData }): Promise<{ status: string }> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`refund: order ${orderId} not found`);

  console.warn(`refund: stub refund for order ${orderId}; full on-chain refund in Phase 6`);

  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } }),
    prisma.ledgerEntry.create({
      data: {
        type: "REFUND",
        orderId: order.id,
        stellarTxHash: "",
        sourceAddress: "",
        destAddress: "",
        amount: order.grossAmount,
        assetCode: order.currency,
        assetIssuer: null,
        status: "PENDING",
      },
    }),
  ]);

  return { status: "PENDING" };
}
