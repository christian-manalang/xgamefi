import { prisma } from "@xgamefi/db";
import { toOrderDto, type OrderDto } from "@xgamefi/shared/dto";
import type { PlayerOrdersQuery } from "@xgamefi/shared/zod/order";

export type PlayerOrderHistoryItem = OrderDto & {
  item: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
};

export async function getPlayerShopOrders(
  slug: string,
  playerId: string,
  query: PlayerOrdersQuery,
): Promise<{ orders: PlayerOrderHistoryItem[]; total: number; page: number; pageSize: number } | null> {
  const shop = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    select: { studioId: true },
  });
  if (!shop) return null;

  const where = { playerId, studioId: shop.studioId };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        item: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: rows.map((row) => ({
      ...toOrderDto(row),
      item: row.item,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
