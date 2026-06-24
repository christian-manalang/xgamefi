import { prisma } from "@xgamefi/db";
import { toShopDto } from "@xgamefi/shared/dto";
import { requireStudio, scopeToStudio } from "../../../../../../lib/auth/guards";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const row = await prisma.shop.findFirst({
    where: { studioId },
    include: { studio: { select: { slug: true } } },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ shop: toShopDto(row) }, { status: 200 });
}
