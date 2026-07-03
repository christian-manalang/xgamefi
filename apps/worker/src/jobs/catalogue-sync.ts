import { prisma, Prisma } from "@xgamefi/db";
import { fetchRemoteItems, upsertCatalogueItems } from "@xgamefi/shared";
import { ShopLayoutSchema, type ShopLayout } from "@xgamefi/shared/zod/shop";

export type CatalogueSyncJobData = { studioId: string };

function mergeNewItemsIntoLayout(layout: unknown, activeIds: string[]): ShopLayout | null {
  const parsed = ShopLayoutSchema.safeParse(layout);
  if (!parsed.success) return null;
  const sections = parsed.data.sections;
  if (sections.length === 0) return null;
  const layoutIds = new Set(sections.flatMap((s) => s.itemIds));
  const newIds = activeIds.filter((id) => !layoutIds.has(id));
  if (newIds.length === 0) return null;
  sections[0]!.itemIds.push(...newIds);
  return parsed.data;
}

export async function catalogueSyncProcessor(job: {
  data: CatalogueSyncJobData;
}): Promise<{ upserted: number; deactivated: number; shopUpdated: boolean }> {
  const { studioId } = job.data;
  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw new Error(`catalogue-sync: studio ${studioId} not found`);
  if (studio.integrationMode !== "API_PULL") {
    throw new Error(`catalogue-sync: studio ${studioId} is not in API_PULL mode`);
  }
  if (!studio.apiBaseUrl) {
    throw new Error(`catalogue-sync: studio ${studioId} has no apiBaseUrl`);
  }
  const items = await fetchRemoteItems(studio.apiBaseUrl);
  const { upserted, deactivated } = await upsertCatalogueItems(studioId, items);

  const shop = await prisma.shop.findUnique({ where: { studioId } });
  let shopUpdated = false;
  if (shop) {
    const activeItems = await prisma.item.findMany({
      where: { studioId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const activeIds = activeItems.map((i) => i.id);

    const newLayout = mergeNewItemsIntoLayout(shop.layout, activeIds);
    const newDraftLayout = shop.draftLayout
      ? mergeNewItemsIntoLayout(shop.draftLayout, activeIds)
      : null;

    if (newLayout || newDraftLayout) {
      await prisma.shop.update({
        where: { studioId },
        data: {
          ...(newLayout ? { layout: newLayout as Prisma.InputJsonValue } : {}),
          ...(newDraftLayout ? { draftLayout: newDraftLayout as Prisma.InputJsonValue } : {}),
        },
      });
      shopUpdated = true;
    }
  }

  return { upserted, deactivated, shopUpdated };
}
