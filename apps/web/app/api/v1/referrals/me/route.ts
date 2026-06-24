import { prisma, Prisma } from "@xgamefi/db";
import { toReferralPerformanceDto } from "@xgamefi/shared/dto";
import { requirePrincipal } from "../../../../../lib/auth/guards";
import { rateLimit } from "../../../../../lib/auth/ratelimit";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function GET(_req: Request) {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return json({ error: "forbidden" }, 403);
  const rl = await rateLimit({ scope: "ref:me", identifier: principal.playerId, limit: 60, windowSec: 60 });
  if (!rl.allowed) return json({ error: "rate_limited" }, 429);

  const own = await prisma.referral.findFirst({
    where: { referrerPlayerId: principal.playerId, refereePlayerId: null },
  });
  const code = own?.code ?? "";

  const invitees = await prisma.referral.findMany({
    where: { referrerPlayerId: principal.playerId, refereePlayerId: { not: null } },
  });
  const total = invitees.length;
  const qualified = invitees.filter((r) => r.status === "QUALIFIED").length;
  const rewarded = invitees.filter((r) => r.status === "REWARDED").length;
  let totalReward = new Prisma.Decimal(0);
  let rewardCurrency: string | null = null;
  for (const r of invitees) {
    if (r.rewardAmount) totalReward = totalReward.plus(r.rewardAmount);
    if (r.rewardCurrency) rewardCurrency = r.rewardCurrency;
  }

  return json(toReferralPerformanceDto({ code, total, qualified, rewarded, totalRewardAmount: totalReward, rewardCurrency }));
}
