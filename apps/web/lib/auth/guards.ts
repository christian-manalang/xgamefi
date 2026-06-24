import { prisma } from "@xgamefi/db";
import type { Principal } from "@xgamefi/shared/auth";
import { readSession, readSessionCookie } from "./session";

export class AuthError extends Error {
  constructor(public status: 401 | 403, public code: string) {
    super(code);
    this.name = "AuthError";
  }
}

export async function getPrincipal(): Promise<Principal | null> {
  const sessionId = await readSessionCookie();
  if (!sessionId) return null;
  const subject = await readSession(sessionId);
  if (!subject) return null;
  if (subject.kind === "user") {
    const u = await prisma.user.findFirst({ where: { id: subject.userId, isActive: true } });
    if (!u) return null;
    return {
      kind: "user",
      userId: u.id,
      role: u.role as "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER",
      studioId: u.studioId ?? undefined,
    };
  }
  const p = await prisma.player.findUnique({ where: { id: subject.playerId } });
  if (!p) return null;
  return { kind: "player", playerId: p.id, walletAddress: p.walletAddress };
}

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) throw new AuthError(401, "UNAUTHENTICATED");
  return p;
}

export async function requireRole(
  ...roles: Array<"ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER">
): Promise<Principal> {
  const p = await requirePrincipal();
  if (p.kind !== "user" || !roles.includes(p.role)) throw new AuthError(403, "FORBIDDEN");
  return p;
}

export async function requireStudio(studioId: string): Promise<Principal> {
  const p = await requirePrincipal();
  scopeToStudio(p, studioId);
  return p;
}

export function scopeToStudio(principal: Principal, studioId: string): void {
  if (principal.kind === "user" && principal.role === "ADMIN") return;
  if (principal.kind === "user" && principal.studioId === studioId) return;
  throw new AuthError(403, "FORBIDDEN");
}
