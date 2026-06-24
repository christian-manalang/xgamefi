import { ShopItemsQuery } from "@xgamefi/shared/zod/catalogue";
import { getShopItems } from "../../../../../../lib/catalogue-queries";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = ShopItemsQuery.safeParse(params);
  if (!parsed.success) return Response.json({ error: "invalid query" }, { status: 400 });
  const result = await getShopItems(slug, parsed.data);
  return Response.json(result, { status: 200 });
}
