import { randomBytes } from "node:crypto";
import { prisma } from "@xgamefi/db";
import { requirePrincipal } from "../../../../lib/auth/guards";
import { rateLimit } from "../../../../lib/auth/ratelimit";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function genCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export async function POST(_req: Request) {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return json({ error: "forbidden" }, 403);
  const rl = await rateLimit({ scope: "ref:gen", identifier: principal.playerId, limit: 30, windowSec: 60 });
  if (!rl.allowed) return json({ error: "rate_limited" }, 429);

  const existing = await prisma.referral.findFirst({
    where: { referrerPlayerId: principal.playerId, refereePlayerId: null },
  });
  if (existing) return json({ code: existing.code });

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      const row = await prisma.referral.create({
        data: { code, referrerPlayerId: principal.playerId, refereePlayerId: null, status: "PENDING" },
      });
      return json({ code: row.code });
    } catch {
      /* unique collision — retry */
    }
  }
  return json({ error: "code_generation_failed" }, 500);
}
