import { prisma, Prisma } from "@xgamefi/db";
import { toOrderDto } from "@xgamefi/shared/dto";
import type { OrderDto, OrderRow } from "@xgamefi/shared/dto";

export type StudioOrderListItem = OrderDto & {
  playerWallet: string;
  itemName: string;
};

export type ListStudioOrdersInput = {
  studioId: string;
  paymentStatus?: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  deliveryStatus?: "PENDING" | "DELIVERED" | "FAILED";
  cursor?: string;
  limit?: number;
};

export async function listStudioOrders(
  input: ListStudioOrdersInput,
): Promise<{ data: StudioOrderListItem[]; nextCursor: string | null }> {
  const limit = input.limit ?? 50;
  const where: Prisma.OrderWhereInput = {
    studioId: input.studioId,
    ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
    ...(input.deliveryStatus ? { deliveryStatus: input.deliveryStatus } : {}),
  };

  const rows = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      player: { select: { walletAddress: true } },
      item: { select: { name: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    data: page.map((row) => ({
      ...toOrderDto(row as OrderRow),
      playerWallet: row.player.walletAddress,
      itemName: row.item.name,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}
