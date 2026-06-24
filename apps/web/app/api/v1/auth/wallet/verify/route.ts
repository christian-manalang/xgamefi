import { WalletVerifyInput } from "@xgamefi/shared/zod/auth";
import { verifyWalletSignature } from "@xgamefi/shared/auth";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { prisma } from "@xgamefi/db";
import { assertCsrf } from "../../../../../../lib/auth/csrf";
import { rateLimit } from "../../../../../../lib/auth/ratelimit";
import { createSession, buildSessionSetCookie } from "../../../../../../lib/auth/session";
import { writeAudit } from "../../../../../../lib/auth/audit";
import { jsonOk, jsonError, errorToResponse } from "../../../../../../lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const rl = await rateLimit({ scope: "auth:wallet:verify", identifier: ip, limit: 20, windowSec: 60 });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = WalletVerifyInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");
    const { walletAddress, signature } = parsed.data;

    const challenge = await prisma.authChallenge.findFirst({
      where: { walletAddress, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) return jsonError(401, "INVALID_SIGNATURE");

    const valid = verifyWalletSignature({ walletAddress, nonce: challenge.nonce, signatureBase64: signature });
    if (!valid) {
      await writeAudit({ actorType: "ANON", action: "auth.wallet.failure", entityType: "Player", entityId: walletAddress, ip });
      return jsonError(401, "INVALID_SIGNATURE");
    }

    // Single-use: atomically claim the nonce; if 0 rows updated, it was already used.
    const claimed = await prisma.authChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return jsonError(401, "INVALID_SIGNATURE");

    const player = await prisma.player.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    const { sessionId } = await createSession({
      subject: { kind: "player", playerId: player.id },
      userAgent: req.headers.get("user-agent") ?? "",
      ip,
    });
    await writeAudit({ actorType: "PLAYER", action: "auth.wallet.success", entityType: "Player", entityId: player.id, ip });

    return jsonOk(
      toMeDto({ kind: "player", playerId: player.id, walletAddress: player.walletAddress }),
      { headers: { "set-cookie": buildSessionSetCookie(sessionId) } },
    );
  } catch (e) {
    return errorToResponse(e);
  }
}
