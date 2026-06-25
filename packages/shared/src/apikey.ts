import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const PREFIX_LEN = 12;

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function apiKeyPrefix(raw: string): string {
  return raw.slice(0, PREFIX_LEN);
}

export function generateApiKey(): {
  raw: string;
  prefix: string;
  hashedKey: string;
} {
  const raw = "xgk_" + randomBytes(32).toString("base64url");
  return { raw, prefix: apiKeyPrefix(raw), hashedKey: hashApiKey(raw) };
}

export function verifyApiKey(raw: string, hashedKey: string): boolean {
  const a = Buffer.from(hashApiKey(raw), "hex");
  const b = Buffer.from(hashedKey, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateWebhookSecret(): { raw: string; hash: string } {
  const raw = "whsec_" + randomBytes(32).toString("base64url");
  return { raw, hash: hashApiKey(raw) };
}
