import { describe, it, expect } from "vitest";
import { LoginInput, WalletChallengeInput, WalletVerifyInput } from "./auth";

const G = "G" + "A".repeat(55); // 56 chars, valid charset

describe("auth zod schemas", () => {
  it("LoginInput accepts valid, rejects empty", () => {
    expect(LoginInput.safeParse({ username: "admin", password: "pw" }).success).toBe(true);
    expect(LoginInput.safeParse({ username: "", password: "pw" }).success).toBe(false);
    expect(LoginInput.safeParse({ username: "admin" }).success).toBe(false);
  });

  it("WalletChallengeInput validates Stellar G-address", () => {
    expect(WalletChallengeInput.safeParse({ walletAddress: G }).success).toBe(true);
    expect(WalletChallengeInput.safeParse({ walletAddress: "G123" }).success).toBe(false);
    expect(WalletChallengeInput.safeParse({ walletAddress: "M" + "A".repeat(55) }).success).toBe(false);
  });

  it("WalletVerifyInput requires address + signature", () => {
    expect(WalletVerifyInput.safeParse({ walletAddress: G, signature: "abc" }).success).toBe(true);
    expect(WalletVerifyInput.safeParse({ walletAddress: G }).success).toBe(false);
  });
});
