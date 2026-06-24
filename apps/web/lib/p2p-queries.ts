import { prisma, Prisma } from "@xgamefi/db";
import { assertOwnsItem } from "@xgamefi/shared/p2p/ownership";
import { toP2PListingDto, type P2PListingDto } from "@xgamefi/shared/dto";

export async function createListing(input: {
  sellerPlayerId: string;
  itemId: string;
  price: string;
  currency: "XLM" | "USDT";
}): Promise<P2PListingDto> {
  const item = await prisma.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error("item not found");

  await assertOwnsItem({ studioId: item.studioId, playerId: input.sellerPlayerId, itemId: item.id });

  const listing = await prisma.p2PListing.create({
    data: {
      studioId: item.studioId,
      itemId: item.id,
      sellerPlayerId: input.sellerPlayerId,
      price: new Prisma.Decimal(input.price),
      currency: input.currency,
      status: "ACTIVE",
    },
  });

  await prisma.itemOwnership.upsert({
    where: { playerId_itemId: { playerId: input.sellerPlayerId, itemId: item.id } },
    create: {
      playerId: input.sellerPlayerId,
      itemId: item.id,
      studioId: item.studioId,
      quantity: 0,
      source: "P2P",
      lockedForListingId: listing.id,
    },
    update: { lockedForListingId: listing.id },
  });

  return toP2PListingDto(listing);
}

export async function getListing(id: string): Promise<P2PListingDto | null> {
  const row = await prisma.p2PListing.findUnique({ where: { id } });
  return row ? toP2PListingDto(row) : null;
}
