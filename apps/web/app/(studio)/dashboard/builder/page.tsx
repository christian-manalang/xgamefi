import { prisma } from "@xgamefi/db";
import { toShopDto, toItemDto } from "@xgamefi/shared/dto";
import { requireRole } from "../../../../lib/auth/guards";
import { ShopBuilder } from "./ShopBuilder";

export default async function BuilderPage() {
  const principal = await requireRole("STUDIO_OWNER", "STUDIO_MEMBER", "ADMIN");
  if (principal.kind !== "user" || !principal.studioId) throw new Error("studio required");
  const studioId = principal.studioId;

  const [shop, items] = await Promise.all([
    prisma.shop.findUniqueOrThrow({
      where: { studioId },
      include: { studio: { select: { slug: true } } },
    }),
    prisma.item.findMany({ where: { studioId, isActive: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return <ShopBuilder shop={toShopDto(shop)} items={items.map(toItemDto)} />;
}
