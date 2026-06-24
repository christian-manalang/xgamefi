import { LoginInput } from "@xgamefi/shared/zod/auth";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { prisma } from "@xgamefi/db";
import { verifyPassword } from "../../../../../lib/auth/password";
import { createSession, buildSessionSetCookie } from "../../../../../lib/auth/session";
import { assertCsrf } from "../../../../../lib/auth/csrf";
import { rateLimit, registerLoginFailure, clearLoginFailures, loginBackoffActive } from "../../../../../lib/auth/ratelimit";
import { writeAudit } from "../../../../../lib/auth/audit";
import { jsonOk, jsonError, errorToResponse } from "../../../../../lib/http";

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = clientIp(req);
    const rl = await rateLimit({ scope: "auth:login", identifier: ip, limit: 10, windowSec: 60 });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = LoginInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");
    const { username, password } = parsed.data;

    if (await loginBackoffActive(username)) return jsonError(429, "TOO_MANY_ATTEMPTS");

    const user = await prisma.user.findUnique({ where: { username } });
    const ok = user && user.isActive && (await verifyPassword(user.passwordHash, password));
    if (!user || !ok) {
      await registerLoginFailure(username);
      await writeAudit({ actorType: "ANON", action: "auth.login.failure", entityType: "User", entityId: username, ip });
      return jsonError(401, "INVALID_CREDENTIALS");
    }

    await clearLoginFailures(username);
    const { sessionId } = await createSession({
      subject: { kind: "user", userId: user.id },
      userAgent: req.headers.get("user-agent") ?? "",
      ip,
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit({ actorType: "USER", actorUserId: user.id, action: "auth.login.success", entityType: "User", entityId: user.id, ip });

    return jsonOk(
      toMeDto({ kind: "user", userId: user.id, role: user.role as "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER", studioId: user.studioId ?? undefined }),
      { headers: { "set-cookie": buildSessionSetCookie(sessionId) } },
    );
  } catch (e) {
    return errorToResponse(e);
  }
}
