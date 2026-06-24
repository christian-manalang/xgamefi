import { prisma } from "@xgamefi/db";
import { toShopDto } from "@xgamefi/shared/dto";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  const row = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    include: { studio: { select: { slug: true } } },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ shop: toShopDto(row) }, { status: 200 });
}
