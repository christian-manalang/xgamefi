import { prisma } from "@xgamefi/db";
import { ShopLayoutSchema } from "@xgamefi/shared";
import { toShopDto } from "@xgamefi/shared/dto";
import { requireStudio, scopeToStudio } from "../../../../../../../lib/auth/guards";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: studioId } = await ctx.params;

  let principal;
  try {
    principal = await requireStudio(studioId);
    scopeToStudio(principal, studioId);
  } catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 401;
    return Response.json({ error: "forbidden" }, { status });
  }

  const current = await prisma.shop.findUnique({ where: { studioId }, select: { draftLayout: true } });
  console.log(`[shop/publish POST] studioId=${studioId} draftLayout=`, JSON.stringify(current?.draftLayout));
  const parsed = ShopLayoutSchema.safeParse(current?.draftLayout ?? null);
  if (!parsed.success) {
    console.error("[shop/publish POST] draftLayout invalid:", JSON.stringify(parsed.error.flatten()));
    return Response.json({ error: "no valid draft to publish" }, { status: 409 });
  }

  const shop = await prisma.shop.update({
    where: { studioId },
    data: { layout: parsed.data, status: "PUBLISHED", publishedAt: new Date() },
    include: { studio: { select: { slug: true } } },
  });

  return Response.json({ shop: toShopDto(shop) }, { status: 200 });
}
