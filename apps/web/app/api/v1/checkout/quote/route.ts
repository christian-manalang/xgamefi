import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { createOrderQuote } from "@/lib/checkout-queries";
import { CheckoutQuoteInput } from "@xgamefi/shared/zod/checkout";

export async function POST(req: Request): Promise<Response> {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }

  const parsed = CheckoutQuoteInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const result = await createOrderQuote({
    playerId: principal.playerId,
    itemId: parsed.data.itemId,
    quantity: parsed.data.quantity,
    currency: parsed.data.currency,
    referralCode: parsed.data.referralCode,
  });

  return NextResponse.json(result, { status: 200 });
}
