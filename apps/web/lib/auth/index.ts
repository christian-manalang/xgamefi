export {
  getPrincipal,
  requirePrincipal,
  requireRole,
  requireStudio,
  scopeToStudio,
  AuthError,
} from "./guards";
export {
  createSession,
  readSession,
  revokeSession,
  buildSessionSetCookie,
  buildSessionClearCookie,
  readSessionCookie,
  SESSION_COOKIE,
  IDLE_TTL_SEC,
  type SessionSubject,
} from "./session";
export { writeAudit } from "./audit";
export { rateLimit, registerLoginFailure, clearLoginFailures, loginBackoffActive } from "./ratelimit";
export type { Principal } from "@xgamefi/shared/auth";
