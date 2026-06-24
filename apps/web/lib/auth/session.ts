import { cookies } from "next/headers";
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { redis } from "./redis";
import { generateSessionId, hashToken } from "@xgamefi/shared/auth";

export const SESSION_COOKIE = "xgf_session";
export const IDLE_TTL_SEC = 1800;

export type SessionSubject = { kind: "user"; userId: string } | { kind: "player"; playerId: string };

function redisKey(sessionId: string): string {
  return `sess:${hashToken(sessionId)}`;
}

export async function createSession(args: {
  subject: SessionSubject; userAgent: string; ip: string;
}): Promise<{ sessionId: string }> {
  const sessionId = generateSessionId();
  const tokenHash = hashToken(sessionId);
  const expiresAt = new Date(Date.now() + IDLE_TTL_SEC * 1000);
  await prisma.session.create({
    data: {
      tokenHash,
      userAgent: args.userAgent,
      ip: args.ip,
      expiresAt,
      ...(args.subject.kind === "user" ? { userId: args.subject.userId } : { playerId: args.subject.playerId }),
    },
  });
  await redis.set(redisKey(sessionId), JSON.stringify(args.subject), "EX", IDLE_TTL_SEC);
  return { sessionId };
}

export async function readSession(sessionId: string): Promise<SessionSubject | null> {
  const raw = await redis.get(redisKey(sessionId));
  if (!raw) return null;
  // sliding refresh
  await redis.expire(redisKey(sessionId), IDLE_TTL_SEC);
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(sessionId), revokedAt: null },
    data: { expiresAt: new Date(Date.now() + IDLE_TTL_SEC * 1000) },
  });
  return JSON.parse(raw) as SessionSubject;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await redis.del(redisKey(sessionId));
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(sessionId), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Cookie is attached to the route Response (testable, and the documented
// route-handler pattern). Reading uses next/headers within the request scope.
function cookieAttrs(maxAge: number): string {
  const parts = [`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=${maxAge}`];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildSessionSetCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; ${cookieAttrs(IDLE_TTL_SEC)}`;
}

export function buildSessionClearCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttrs(0)}`;
}

export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
