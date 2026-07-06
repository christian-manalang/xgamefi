import { prisma } from "@xgamefi/db";
import { fetchRemoteItems } from "@xgamefi/shared";

export type StockSyncJobData = { studioId: string };

export async function stockSyncProcessor(job: { data: StockSyncJobData }): Promise<{
  updated: number;
}> {
  const { studioId } = job.data;
  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw new Error(`stock-sync: studio ${studioId} not found`);
  if (studio.integrationMode !== "API_PULL") {
    throw new Error(`stock-sync: studio ${studioId} is not in API_PULL mode`);
  }
  if (!studio.apiBaseUrl) {
    throw new Error(`stock-sync: studio ${studioId} has no apiBaseUrl`);
  }

  const items = await fetchRemoteItems(studio.apiBaseUrl);
  const syncedAt = new Date();

  return prisma.$transaction(async (tx) => {
    let updated = 0;
    for (const item of items) {
      const result = await tx.item.updateMany({
        where: { studioId, externalId: item.externalId },
        data: { stock: item.stock ?? null, syncedAt },
      });
      updated += result.count;
    }
    return { updated };
  });
}
