import { prisma, Prisma } from "@xgamefi/db";
import { toItemDto, toShopDto, type ItemDto, type ShopDto } from "@xgamefi/shared/dto";
import type { ShopItemsQuery } from "@xgamefi/shared/zod/catalogue";

export async function getShopItems(
  slug: string,
  query: ShopItemsQuery,
): Promise<{ items: ItemDto[]; total: number; page: number; pageSize: number }> {
  const shop = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    select: { studioId: true, featuredItemIds: true },
  });
  if (!shop) {
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  const where: Prisma.ItemWhereInput = { studioId: shop.studioId, isActive: true, isListed: true };
  if (query.q) where.name = { contains: query.q, mode: "insensitive" };
  if (query.category) where.category = query.category;
  if (query.rarity) where.rarity = query.rarity;
  if (query.featured) where.id = { in: shop.featuredItemIds };

  const orderBy: Prisma.ItemOrderByWithRelationInput[] =
    query.sort === "price_asc"
      ? [{ priceAmount: "asc" }]
      : query.sort === "price_desc"
        ? [{ priceAmount: "desc" }]
        : query.sort === "newest"
          ? [{ createdAt: "desc" }]
          : [{ createdAt: "asc" }];

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  return { items: rows.map(toItemDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getPublishedShop(slug: string): Promise<ShopDto | null> {
  const row = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    include: { studio: { select: { slug: true } } },
  });
  return row ? toShopDto(row) : null;
}

export async function getPublicItem(id: string): Promise<ItemDto | null> {
  const row = await prisma.item.findFirst({ where: { id, isActive: true, isListed: true } });
  return row ? toItemDto(row) : null;
}

export async function getShopFilterOptions(slug: string): Promise<{ categories: string[]; rarities: string[] }> {
  const shop = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    select: { studioId: true },
  });
  if (!shop) return { categories: [], rarities: [] };

  const [categoryRows, rarityRows] = await Promise.all([
    prisma.item.findMany({
      where: { studioId: shop.studioId, isActive: true, isListed: true, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
    }),
    prisma.item.findMany({
      where: { studioId: shop.studioId, isActive: true, isListed: true, rarity: { not: null } },
      distinct: ["rarity"],
      select: { rarity: true },
    }),
  ]);

  return {
    categories: categoryRows.map((r) => r.category).filter((c): c is string => c !== null).sort(),
    rarities: rarityRows.map((r) => r.rarity).filter((r): r is string => r !== null).sort(),
  };
}

export async function getStudioBrand(slug: string): Promise<Record<string, unknown> | null> {
  const studio = await prisma.studio.findUnique({ where: { slug }, select: { brand: true, name: true } });
  if (!studio) return null;
  return { ...(studio.brand as Record<string, unknown> | null ?? {}), name: studio.name };
}
