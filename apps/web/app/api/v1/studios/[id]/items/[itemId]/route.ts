import { prisma, Prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { ItemOverrideInput } from "@xgamefi/shared/zod/catalogue";
import { requireStudio, scopeToStudio } from "@/lib/auth/guards";
import { writeAudit } from "@xgamefi/shared";
import { getClientIp } from "@/lib/http";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  const { id: studioId, itemId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const parsed = ItemOverrideInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid override" }, { status: 400 });
  }

  const existing = await prisma.item.findFirst({ where: { id: itemId, studioId } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const {
    name,
    description,
    imageUrl,
    category,
    rarity,
    priceAmount,
    priceCurrency,
    stock,
    saleStartsAt,
    saleEndsAt,
    featured,
    isListed,
  } = parsed.data;

  const data: Prisma.ItemUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (imageUrl !== undefined) data.imageUrl = imageUrl;
  if (category !== undefined) data.category = category;
  if (rarity !== undefined) data.rarity = rarity;
  if (priceAmount !== undefined) data.priceAmount = new Prisma.Decimal(priceAmount);
  if (priceCurrency !== undefined) data.priceCurrency = priceCurrency;
  if (stock !== undefined) data.stock = stock;
  if (isListed !== undefined) data.isListed = isListed;
  if (saleStartsAt !== undefined || saleEndsAt !== undefined) {
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    data.metadata = {
      ...metadata,
      saleWindow: { startsAt: saleStartsAt ?? null, endsAt: saleEndsAt ?? null },
    } as Prisma.InputJsonValue;
  }

  const updated = await prisma.item.update({ where: { id: itemId }, data });

  if (featured !== undefined) {
    const shop = await prisma.shop.findUnique({ where: { studioId } });
    if (shop) {
      const set = new Set(shop.featuredItemIds);
      if (featured) set.add(itemId);
      else set.delete(itemId);
      await prisma.shop.update({ where: { studioId }, data: { featuredItemIds: [...set] } });
    }
  }

  await writeAudit({
    actorType: "USER",
    actorUserId: principal.kind === "user" ? principal.userId : null,
    action: "item.override",
    entityType: "Item",
    entityId: itemId,
    metadata: { studioId, fields: Object.keys(parsed.data) },
    ip: getClientIp(req),
  });

  return Response.json({ item: toItemDto(updated) }, { status: 200 });
}
