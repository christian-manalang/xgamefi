import type { Principal } from "../auth";

export type MeDto =
  | { kind: "user"; userId: string; role: "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER"; studioId: string | null }
  | { kind: "player"; playerId: string; walletAddress: string };

export function toMeDto(p: Principal): MeDto {
  if (p.kind === "user") {
    return { kind: "user", userId: p.userId, role: p.role, studioId: p.studioId ?? null };
  }
  return { kind: "player", playerId: p.playerId, walletAddress: p.walletAddress };
}
