import { WalletChallengeInput } from "@xgamefi/shared/zod/auth";
import { generateNonce } from "@xgamefi/shared/auth";
import { prisma } from "@xgamefi/db";
import { assertCsrf } from "../../../../../../lib/auth/csrf";
import { rateLimit } from "../../../../../../lib/auth/ratelimit";
import { jsonOk, jsonError, errorToResponse } from "../../../../../../lib/http";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const rl = await rateLimit({ scope: "auth:wallet:challenge", identifier: ip, limit: 20, windowSec: 60 });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = WalletChallengeInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");

    const nonce = generateNonce();
    await prisma.authChallenge.create({
      data: {
        walletAddress: parsed.data.walletAddress,
        nonce,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    return jsonOk({ nonce });
  } catch (e) {
    return errorToResponse(e);
  }
}
