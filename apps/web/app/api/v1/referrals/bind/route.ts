import { cookies } from "next/headers";
import { prisma } from "@xgamefi/db";
import { ReferralBindInput } from "@xgamefi/shared/zod/referral";
import { requirePrincipal } from "../../../../../lib/auth/guards";
import { rateLimit } from "../../../../../lib/auth/ratelimit";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request) {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return json({ error: "forbidden" }, 403);
  const rl = await rateLimit({ scope: "ref:bind", identifier: principal.playerId, limit: 30, windowSec: 60 });
  if (!rl.allowed) return json({ error: "rate_limited" }, 429);

  let code: string | undefined;
  const parsed = ReferralBindInput.safeParse(await req.json().catch(() => ({})));
  if (parsed.success) code = parsed.data.code;
  if (!code) {
    const jar = await cookies();
    code = jar.get("xgf_ref")?.value;
  }
  if (!code) return json({ error: "no_referral_code" }, 400);

  const referrerRef = await prisma.referral.findFirst({
    where: { code, refereePlayerId: null },
  });
  if (!referrerRef) return json({ error: "invalid_code" }, 404);

  if (referrerRef.referrerPlayerId === principal.playerId) {
    return json({ error: "self_referral" }, 409);
  }

  const player = await prisma.player.findUnique({ where: { id: principal.playerId } });
  if (player?.referredByPlayerId) {
    return json({ ok: true, alreadyBound: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: principal.playerId },
      data: { referredByPlayerId: referrerRef.referrerPlayerId },
    });
    await tx.referral.create({
      data: {
        code: `${referrerRef.code}-${principal.playerId.slice(0, 8)}`,
        referrerPlayerId: referrerRef.referrerPlayerId,
        refereePlayerId: principal.playerId,
        status: "PENDING",
      },
    });
  });

  return json({ ok: true });
}
