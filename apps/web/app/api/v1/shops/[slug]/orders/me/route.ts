import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { getPlayerShopOrders } from "@/lib/player-order-queries";
import { PlayerOrdersQuery } from "@xgamefi/shared/zod/order";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  let principal;
  try {
    principal = await requirePrincipal();
  } catch (e) {
    console.error("[shops/:slug/orders/me] auth failed", e);
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }

  const { slug } = await ctx.params;
  const searchParams = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = PlayerOrdersQuery.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }

  const result = await getPlayerShopOrders(slug, principal.playerId, parsed.data);
  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
