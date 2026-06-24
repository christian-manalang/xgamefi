import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { getTrade } from "@/lib/p2p-queries";
import { P2PTradeSubmitInput } from "@xgamefi/shared/zod/p2p";
import { verifyAndAdvanceP2PTrade } from "@xgamefi/shared/p2p/settlement";
import { withIdempotency, type RedisLike } from "@xgamefi/shared/idempotency";
import { getRedis } from "@xgamefi/shared/queues";

export async function POST(req: Request): Promise<Response> {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return NextResponse.json({ error: "player wallet required" }, { status: 403 });

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) return NextResponse.json({ error: "Idempotency-Key header required" }, { status: 400 });

  const rawBody = await req.text();
  const parsed = P2PTradeSubmitInput.safeParse(safeJson(rawBody));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const requestHash = createHash("sha256").update(rawBody).digest("hex");
  const result = await withIdempotency(
    { key: idempotencyKey, scope: "p2p:trade:submit", requestHash },
    async () => {
      const advance = await verifyAndAdvanceP2PTrade({ tradeId: parsed.data.tradeId, txHash: parsed.data.txHash });
      const trade = await getTrade(parsed.data.tradeId);
      if (!trade) throw new Error("trade disappeared");
      return { trade, result: advance };
    },
    getRedis() as RedisLike,
  );

  return NextResponse.json(result, { status: 200 });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
