import { randomBytes, createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

export function generateNonce(): string {
  return randomBytes(24).toString("base64url"); // 32 chars
}

export function challengeMessage(walletAddress: string, nonce: string): string {
  return `xGameFi login\naddress: ${walletAddress}\nnonce: ${nonce}`;
}

function sep53Payload(message: string): Buffer {
  const prefix = Buffer.from("Stellar Signed Message:\n", "utf8");
  const messageBytes = Buffer.from(message, "utf8");
  return Buffer.concat([prefix, messageBytes]);
}

function sep53Hash(message: string): Buffer {
  return createHash("sha256").update(sep53Payload(message)).digest();
}

export function verifyWalletSignature(args: {
  walletAddress: string;
  nonce: string;
  signatureBase64: string;
}): boolean {
  try {
    const kp = Keypair.fromPublicKey(args.walletAddress);
    const message = challengeMessage(args.walletAddress, args.nonce);
    const msgBytes = Buffer.from(message, "utf8");
    const sig = Buffer.from(args.signatureBase64, "base64");

    // SEP-53: wallets like Freighter sign sha256("Stellar Signed Message:\n" + message)
    if (kp.verify(sep53Hash(message), sig)) return true;

    // Backwards-compatible fallback for raw message signatures
    return kp.verify(msgBytes, sig);
  } catch {
    return false;
  }
}
