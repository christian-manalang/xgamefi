import { prisma, Prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { ItemOverrideInput } from "@xgamefi/shared/zod/catalogue";
import { requireStudio, scopeToStudio } from "../../../../../../../lib/auth/guards";

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

  const { priceAmount, priceCurrency, stock, saleStartsAt, saleEndsAt, featured } = parsed.data;
  const data: Prisma.ItemUpdateInput = {};
  if (priceAmount !== undefined) data.priceAmount = new Prisma.Decimal(priceAmount);
  if (priceCurrency !== undefined) data.priceCurrency = priceCurrency;
  if (stock !== undefined) data.stock = stock;
  if (saleStartsAt !== undefined || saleEndsAt !== undefined) {
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    data.metadata = { ...metadata, saleWindow: { startsAt: saleStartsAt ?? null, endsAt: saleEndsAt ?? null } } as Prisma.InputJsonValue;
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

  return Response.json({ item: toItemDto(updated) }, { status: 200 });
}
