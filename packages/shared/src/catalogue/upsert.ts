import { prisma, Prisma } from "@xgamefi/db";
import type { RemoteItem } from "../zod/catalogue";

export async function upsertCatalogueItems(
  studioId: string,
  items: RemoteItem[],
): Promise<{ upserted: number; deactivated: number }> {
  const syncedAt = new Date();
  const externalIds = items.map((i) => i.externalId);

  return prisma.$transaction(async (tx) => {
    for (const item of items) {
      const base = {
        name: item.name,
        description: item.description ?? null,
        imageUrl: item.imageUrl ?? null,
        priceAmount: new Prisma.Decimal(item.price),
        priceCurrency: item.currency,
        stock: item.stock ?? null,
        metadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
        isActive: true,
        syncedAt,
      };
      await tx.item.upsert({
        where: { studioId_externalId: { studioId, externalId: item.externalId } },
        create: { studioId, externalId: item.externalId, ...base },
        update: base,
      });
    }

    const stale = await tx.item.updateMany({
      where: { studioId, externalId: { notIn: externalIds }, isActive: true },
      data: { isActive: false },
    });

    return { upserted: items.length, deactivated: stale.count };
  });
}
