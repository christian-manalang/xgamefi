import { describe, it, expect } from "vitest";
import { scopeToStudio, AuthError } from "./guards";
import type { Principal } from "@xgamefi/shared/auth";

const admin: Principal = { kind: "user", userId: "a", role: "ADMIN" };
const owner: Principal = { kind: "user", userId: "o", role: "STUDIO_OWNER", studioId: "stu-1" };
const player: Principal = { kind: "player", playerId: "p", walletAddress: "G..." };

describe("RBAC guards (pure paths)", () => {
  it("scopeToStudio allows ADMIN for any studio", () => {
    expect(() => scopeToStudio(admin, "stu-9")).not.toThrow();
  });
  it("scopeToStudio allows a member of the same studio", () => {
    expect(() => scopeToStudio(owner, "stu-1")).not.toThrow();
  });
  it("scopeToStudio throws 403 for a member of a different studio", () => {
    expect(() => scopeToStudio(owner, "stu-2")).toThrow(AuthError);
    try { scopeToStudio(owner, "stu-2"); } catch (e) { expect((e as AuthError).status).toBe(403); }
  });
  it("scopeToStudio throws 403 for a player", () => {
    expect(() => scopeToStudio(player, "stu-1")).toThrow(AuthError);
  });
});
