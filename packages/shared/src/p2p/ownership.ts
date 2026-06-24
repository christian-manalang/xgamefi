import { prisma } from "@xgamefi/db";
import { safeFetch } from "../ssrf";
import { z } from "zod";

const InventoryResponse = z.object({ quantity: z.number().int().nonnegative() });

export async function refreshOwnership(args: {
  studioId: string;
  playerId: string;
  itemId: string;
}): Promise<{ quantity: number }> {
  const studio = await prisma.studio.findUnique({ where: { id: args.studioId }, select: { apiBaseUrl: true } });
  if (!studio?.apiBaseUrl) throw new Error(`ownership: studio ${args.studioId} has no apiBaseUrl`);

  const url = `${studio.apiBaseUrl.replace(/\/+$/, "")}/players/${encodeURIComponent(args.playerId)}/inventory/${encodeURIComponent(args.itemId)}`;
  const res = await safeFetch(url, { method: "GET", timeoutMs: 10_000, maxBytes: 1_000_000 });
  if (!res.ok) throw new Error(`ownership: game API returned ${res.status}`);
  const json = await res.json();
  const parsed = InventoryResponse.parse(json);

  await prisma.itemOwnership.upsert({
    where: { playerId_itemId: { playerId: args.playerId, itemId: args.itemId } },
    create: {
      playerId: args.playerId,
      itemId: args.itemId,
      studioId: args.studioId,
      quantity: parsed.quantity,
      source: "P2P",
      lockedForListingId: null,
    },
    update: { quantity: parsed.quantity, studioId: args.studioId },
  });

  return { quantity: parsed.quantity };
}

export async function assertOwnsItem(args: {
  studioId: string;
  playerId: string;
  itemId: string;
}): Promise<void> {
  const { quantity } = await refreshOwnership(args);
  if (quantity < 1) throw new Error("ownership: player does not own this item");
}
