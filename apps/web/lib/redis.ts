import Redis from "ioredis";
import { env } from "@xgamefi/config/env";

let client: Redis | null = null;

function getRedis(): Redis {
  client ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const res = await getRedis().ping();
  return res === "PONG";
}
