import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { getMySellableItems } from "@/lib/p2p-queries";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;

  const principal = await requirePrincipal();
  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }

  const items = await getMySellableItems(slug, principal.playerId);
  return NextResponse.json({ items }, { status: 200 });
}
