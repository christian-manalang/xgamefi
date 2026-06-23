import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { env } from "@xgamefi/config/env";

export const QUEUE_NAMES = [
  "catalogue-sync",
  "stellar-watcher",
  "webhook-delivery",
  "payout",
  "p2p-settlement",
  "referral-reward",
  "refund",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

let connection: IORedis | null = null;
function getConnection(): IORedis {
  connection ??= new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() });
    queues.set(name, q);
  }
  return q;
}

export function registerWorker(name: QueueName, processor: Processor): Worker {
  return new Worker(name, processor, { connection: getConnection() });
}
