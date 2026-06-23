import IORedis from "ioredis";
import { env } from "@xgamefi/config/env";

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
