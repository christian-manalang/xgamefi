import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inV4Range(ip: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const baseInt = ipv4ToInt(base!)!;
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16", // link-local incl. 169.254.169.254 metadata
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
];

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    return BLOCKED_V4.some((cidr) => inV4Range(n, cidr));
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (lower.startsWith("fe80")) return true; // link-local
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedIp(mapped[1]!);
    return false;
  }
  return true; // not a valid IP literal -> block
}

export async function assertPublicUrl(rawUrl: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  const ips = await resolve(url.hostname);
  if (ips.length === 0) throw new Error("Host did not resolve");
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new Error(`Host resolves to a blocked address: ${ip}`);
    }
  }
  (url as URL & { resolvedIp?: string }).resolvedIp = ips[0];
  return url;
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxBytes?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { maxBytes = 1_048_576, timeoutMs = 5000, ...rest } = init;
  const url = await assertPublicUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // eslint-disable-next-line no-restricted-globals
    const res = await fetch(url.toString(), {
      ...rest,
      redirect: "error", // no redirects to disallowed hosts
      signal: controller.signal,
    });
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > maxBytes) {
      throw new Error(`Response exceeds maxBytes (${len} > ${maxBytes})`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
