import { redis } from "./redis";
import { rlKey, loginFailKey, backoffDelaySec } from "@xgamefi/shared/auth";

export async function rateLimit(args: {
  scope: string; identifier: string; limit: number; windowSec: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const key = rlKey(args.scope, args.identifier);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, args.windowSec);
  const remaining = Math.max(0, args.limit - count);
  return { allowed: count <= args.limit, remaining };
}

export async function registerLoginFailure(username: string): Promise<number> {
  const key = loginFailKey(username);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  else await redis.expire(key, Math.max(3600, backoffDelaySec(count)));
  return count;
}

export async function clearLoginFailures(username: string): Promise<void> {
  await redis.del(loginFailKey(username));
}

export async function loginBackoffActive(username: string): Promise<boolean> {
  const count = Number((await redis.get(loginFailKey(username))) ?? 0);
  return backoffDelaySec(count) > 0;
}
