import { prisma } from "@xgamefi/db";
import { fetchRemoteItems, upsertCatalogueItems } from "@xgamefi/shared";

export type CatalogueSyncJobData = { studioId: string };

export async function catalogueSyncProcessor(job: {
  data: CatalogueSyncJobData;
}): Promise<{ upserted: number; deactivated: number }> {
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
  return upsertCatalogueItems(studioId, items);
}
