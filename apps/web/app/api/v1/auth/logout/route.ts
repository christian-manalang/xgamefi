import { assertCsrf } from "../../../../../lib/auth/csrf";
import { readSessionCookie, revokeSession, buildSessionClearCookie } from "../../../../../lib/auth/session";
import { getPrincipal } from "../../../../../lib/auth/guards";
import { writeAudit } from "../../../../../lib/auth/audit";
import { jsonOk, errorToResponse } from "../../../../../lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const principal = await getPrincipal();
    const sessionId = await readSessionCookie();
    if (sessionId) await revokeSession(sessionId);
    if (principal) {
      const id = principal.kind === "user" ? principal.userId : principal.playerId;
      await writeAudit({
        actorType: principal.kind === "user" ? "USER" : "PLAYER",
        actorUserId: principal.kind === "user" ? principal.userId : undefined,
        action: "auth.logout",
        entityType: "Session",
        entityId: id,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0",
      });
    }
    return jsonOk({ ok: true }, { headers: { "set-cookie": buildSessionClearCookie() } });
  } catch (e) {
    return errorToResponse(e);
  }
}
