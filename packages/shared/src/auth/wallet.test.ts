import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { generateNonce, challengeMessage, verifyWalletSignature } from "./wallet";

function signSep53(kp: Keypair, message: string): string {
  const prefix = Buffer.from("Stellar Signed Message:\n", "utf8");
  const payload = Buffer.concat([prefix, Buffer.from(message, "utf8")]);
  const hash = createHash("sha256").update(payload).digest();
  return kp.sign(hash).toString("base64");
}

describe("wallet signature verification", () => {
  it("nonce is high-entropy and unique", () => {
    expect(generateNonce()).not.toEqual(generateNonce());
    expect(generateNonce().length).toBeGreaterThanOrEqual(32);
  });

  it("verifies a valid SEP-53 signature (Freighter format)", () => {
    const kp = Keypair.random();
    const nonce = generateNonce();
    const msg = challengeMessage(kp.publicKey(), nonce);
    const sig = signSep53(kp, msg);
    expect(verifyWalletSignature({ walletAddress: kp.publicKey(), nonce, signatureBase64: sig })).toBe(true);
  });

  it("verifies a valid raw Ed25519 signature over the challenge message", () => {
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
    const sig = signSep53(signer, msg);
    expect(verifyWalletSignature({ walletAddress: claimed.publicKey(), nonce, signatureBase64: sig })).toBe(false);
  });

  it("rejects a tampered nonce", () => {
    const kp = Keypair.random();
    const nonce = generateNonce();
    const sig = signSep53(kp, challengeMessage(kp.publicKey(), nonce));
    expect(verifyWalletSignature({ walletAddress: kp.publicKey(), nonce: nonce + "x", signatureBase64: sig })).toBe(false);
  });

  it("returns false (never throws) on malformed address or signature", () => {
    expect(verifyWalletSignature({ walletAddress: "not-a-key", nonce: "n", signatureBase64: "%%%" })).toBe(false);
  });
});
