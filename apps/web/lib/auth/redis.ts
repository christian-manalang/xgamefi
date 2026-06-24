import Redis from "ioredis";
import { env } from "@xgamefi/config/env";

declare global {
  // eslint-disable-next-line no-var
  var __xgamefi_redis: Redis | undefined;
}

export const redis: Redis = globalThis.__xgamefi_redis ?? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
if (process.env.NODE_ENV !== "production") globalThis.__xgamefi_redis = redis;
