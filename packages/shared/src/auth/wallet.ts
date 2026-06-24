import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

export function generateNonce(): string {
  return randomBytes(24).toString("base64url"); // 32 chars
}

export function challengeMessage(walletAddress: string, nonce: string): string {
  return `xGameFi login\naddress: ${walletAddress}\nnonce: ${nonce}`;
}

export function verifyWalletSignature(args: {
  walletAddress: string;
  nonce: string;
  signatureBase64: string;
}): boolean {
  try {
    const kp = Keypair.fromPublicKey(args.walletAddress);
    const msg = Buffer.from(challengeMessage(args.walletAddress, args.nonce), "utf8");
    const sig = Buffer.from(args.signatureBase64, "base64");
    return kp.verify(msg, sig);
  } catch {
    return false;
  }
}
