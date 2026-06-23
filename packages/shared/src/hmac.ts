import { createHmac, timingSafeEqual } from "node:crypto";

function compute(secret: string, timestampSec: number, rawBody: string): string {
  return createHmac("sha256", secret)
    .update(`${timestampSec}.${rawBody}`)
    .digest("hex");
}

export function signWebhook(secret: string, timestampSec: number, rawBody: string): string {
  return `t=${timestampSec},v1=${compute(secret, timestampSec, rawBody)}`;
}

export function verifyHmac(args: {
  secret: string;
  header: string;
  rawBody: string;
  toleranceSec: number;
}): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(args.header.trim());
  if (!match) return false;
  const timestampSec = Number(match[1]);
  const provided = match[2]!;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSec) > args.toleranceSec) return false;

  const expected = compute(args.secret, timestampSec, args.rawBody);
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
