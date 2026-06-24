import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { generateNonce, challengeMessage, verifyWalletSignature } from "./wallet";

describe("wallet signature verification", () => {
  it("nonce is high-entropy and unique", () => {
    expect(generateNonce()).not.toEqual(generateNonce());
    expect(generateNonce().length).toBeGreaterThanOrEqual(32);
  });

  it("verifies a valid Ed25519 signature over the challenge message", () => {
    const kp = Keypair.random();
    const nonce = generateNonce();
    const msg = challengeMessage(kp.publicKey(), nonce);
    const sig = kp.sign(Buffer.from(msg, "utf8")).toString("base64");
    expect(verifyWalletSignature({ walletAddress: kp.publicKey(), nonce, signatureBase64: sig })).toBe(true);
  });

  it("rejects a signature from a different key", () => {
    const signer = Keypair.random();
    const claimed = Keypair.random();
    const nonce = generateNonce();
    const msg = challengeMessage(claimed.publicKey(), nonce);
    const sig = signer.sign(Buffer.from(msg, "utf8")).toString("base64");
    expect(verifyWalletSignature({ walletAddress: claimed.publicKey(), nonce, signatureBase64: sig })).toBe(false);
  });

  it("rejects a tampered nonce", () => {
    const kp = Keypair.random();
    const nonce = generateNonce();
    const sig = kp.sign(Buffer.from(challengeMessage(kp.publicKey(), nonce), "utf8")).toString("base64");
    expect(verifyWalletSignature({ walletAddress: kp.publicKey(), nonce: nonce + "x", signatureBase64: sig })).toBe(false);
  });

  it("returns false (never throws) on malformed address or signature", () => {
    expect(verifyWalletSignature({ walletAddress: "not-a-key", nonce: "n", signatureBase64: "%%%" })).toBe(false);
  });
});
