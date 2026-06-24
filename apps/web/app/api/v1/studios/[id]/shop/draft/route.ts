import { prisma } from "@xgamefi/db";
import { ShopDraftInputSchema } from "@xgamefi/shared";
import { toShopDto } from "@xgamefi/shared/dto";
import { requireStudio, scopeToStudio } from "../../../../../../lib/auth/guards";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: studioId } = await ctx.params;

  let principal;
  try {
    principal = await requireStudio(studioId);
    scopeToStudio(principal, studioId);
  } catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 401;
    return Response.json({ error: "forbidden" }, { status });
  }

  const parsed = ShopDraftInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }

  const shop = await prisma.shop.update({
    where: { studioId },
    data: {
      draftLayout: parsed.data.layout,
      theme: parsed.data.theme,
      featuredItemIds: parsed.data.featuredItemIds,
    },
    include: { studio: { select: { slug: true } } },
  });

  return Response.json({ shop: toShopDto(shop) }, { status: 200 });
}
