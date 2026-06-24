import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { createTradeQuote } from "@/lib/p2p-queries";
import { P2PTradeQuoteInput } from "@xgamefi/shared/zod/p2p";

export async function POST(req: Request): Promise<Response> {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }
  const parsed = P2PTradeQuoteInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  const result = await createTradeQuote({ buyerPlayerId: principal.playerId, listingId: parsed.data.listingId });
  return NextResponse.json(result, { status: 200 });
}
