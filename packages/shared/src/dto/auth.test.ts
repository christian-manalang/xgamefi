import { describe, it, expect } from "vitest";
import { toMeDto } from "./auth";

describe("toMeDto", () => {
  it("maps a user principal, normalizing missing studioId to null", () => {
    expect(toMeDto({ kind: "user", userId: "u1", role: "ADMIN" })).toEqual({
      kind: "user", userId: "u1", role: "ADMIN", studioId: null,
    });
  });
  it("maps a player principal", () => {
    expect(toMeDto({ kind: "player", playerId: "p1", walletAddress: "G..." })).toEqual({
      kind: "player", playerId: "p1", walletAddress: "G...",
    });
  });
});
