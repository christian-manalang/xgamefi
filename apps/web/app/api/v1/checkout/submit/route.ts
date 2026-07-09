import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { getOrder } from "@/lib/checkout-queries";
import { CheckoutSubmitInput } from "@xgamefi/shared/zod/checkout";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { withIdempotency, type RedisLike } from "@xgamefi/shared/idempotency";
import { getRedis } from "@xgamefi/shared/queues";
import { toOrderDto } from "@xgamefi/shared/dto";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit({
      scope: "checkout:submit",
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

    const idempotencyKey = req.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return NextResponse.json({ error: "Idempotency-Key header required" }, { status: 400 });
    }

    const rawBody = await req.text();
    const parsed = CheckoutSubmitInput.safeParse(safeJson(rawBody));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid input" }, { status: 400 });
    }

    const requestHash = createHash("sha256").update(rawBody).digest("hex");

    const result = await withIdempotency(
      { key: idempotencyKey, scope: "checkout:submit", requestHash },
      async () => {
        const advance = await verifyAndAdvanceOrder({ orderId: parsed.data.orderId, txHash: parsed.data.txHash });
        const order = await getOrder(parsed.data.orderId);
        if (!order) throw new Error("order disappeared after verify");
        return { order: toOrderDto(order), result: advance };
      },
      getRedis() as RedisLike,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[checkout/submit] unhandled error", err);
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
