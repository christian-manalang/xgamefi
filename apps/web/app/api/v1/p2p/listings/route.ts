import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { createListing } from "@/lib/p2p-queries";
import { CreateListingInput } from "@xgamefi/shared/zod/p2p";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http";

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);
  const rl = await rateLimit({
    scope: "p2p:listings",
    identifier: ip,
    limit: 20,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const principal = await requirePrincipal();
  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }

  const parsed = CreateListingInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const listing = await createListing({
    sellerPlayerId: principal.playerId,
    itemId: parsed.data.itemId,
    price: parsed.data.price,
    currency: parsed.data.currency,
  });

  return NextResponse.json({ listing }, { status: 201 });
}
