import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { createOrderQuote } from "@/lib/checkout-queries";
import { CheckoutQuoteInput } from "@xgamefi/shared/zod/checkout";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit({
      scope: "checkout:quote",
      identifier: ip,
      limit: 30,
      windowSec: 60,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: { code: "RATE_LIMITED" } }, { status: 429 });
    }

    const principal = await requirePrincipal();
    if (principal.kind !== "player") {
      return NextResponse.json({ error: { code: "PLAYER_REQUIRED" } }, { status: 403 });
    }

    const parsed = CheckoutQuoteInput.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
    }

    const result = await createOrderQuote({
      playerId: principal.playerId,
      itemId: parsed.data.itemId,
      quantity: parsed.data.quantity,
      currency: parsed.data.currency,
      referralCode: parsed.data.referralCode,
      promotionCode: parsed.data.promotionCode,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof Error && "status" in e && typeof e.status === "number") {
      return NextResponse.json({ error: { code: e.message } }, { status: e.status });
    }
    console.error("checkout quote error", e);
    return NextResponse.json({ error: { code: "INTERNAL" } }, { status: 500 });
  }
}
