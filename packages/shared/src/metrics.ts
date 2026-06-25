import { prisma, Prisma } from "@xgamefi/db";

export type RecentOrder = {
  id: string;
  studioId: string;
  itemName: string;
  grossAmount: Prisma.Decimal;
  currency: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: Date;
};

export type PlatformMetrics = {
  gmv: Prisma.Decimal;
  feesCollected: Prisma.Decimal;
  activeStudios: number;
  recentOrders: RecentOrder[];
};

export async function computePlatformMetrics(): Promise<PlatformMetrics> {
  const [agg, activeStudios, orders] = await prisma.$transaction([
    prisma.order.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { grossAmount: true, platformFeeAmount: true },
    }),
    prisma.studio.count({ where: { status: "ACTIVE" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { item: { select: { name: true } } },
    }),
  ]);

  return {
    gmv: agg._sum.grossAmount ?? new Prisma.Decimal(0),
    feesCollected: agg._sum.platformFeeAmount ?? new Prisma.Decimal(0),
    activeStudios,
    recentOrders: orders.map((o) => ({
      id: o.id,
      studioId: o.studioId,
      itemName: o.item.name,
      grossAmount: o.grossAmount,
      currency: o.currency,
      paymentStatus: o.paymentStatus,
      deliveryStatus: o.deliveryStatus,
      createdAt: o.createdAt,
    })),
  };
}
