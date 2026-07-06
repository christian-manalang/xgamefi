import { Queue, Worker, type Processor } from "bullmq";
import { Redis } from "ioredis";
import { env } from "@xgamefi/config/env";

export type QueueName =
  | "catalogue-sync"
  | "stock-sync"
  | "stellar-watcher"
  | "webhook-delivery"
  | "payout"
  | "p2p-settlement"
  | "referral-reward"
  | "refund";

export const QUEUE_NAMES: QueueName[] = [
  "catalogue-sync",
  "stock-sync",
  "stellar-watcher",
  "webhook-delivery",
  "payout",
  "p2p-settlement",
  "referral-reward",
  "refund",
];

let redis: Redis | null = null;
let redisSubscriber: Redis | null = null;
const queueMap = new Map<QueueName, Queue>();

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    redisSubscriber = getRedis().duplicate({ maxRetriesPerRequest: null });
  }
  return redisSubscriber;
}

export function getQueue(name: QueueName): Queue {
  let q = queueMap.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: getRedis(),
      defaultJobOptions: { removeOnComplete: 10, removeOnFail: 10 },
    });
    queueMap.set(name, q);
  }
  return q;
}

export function registerWorker(name: QueueName, processor: Processor): Worker {
  return new Worker(name, processor, { connection: getRedis(), concurrency: 5 });
}
