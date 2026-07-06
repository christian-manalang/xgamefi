import type { Job, Processor, Worker } from "bullmq";
import { QUEUE_NAMES, registerWorker, getQueue, type QueueName } from "@xgamefi/shared/queues";
import { catalogueSyncProcessor } from "./jobs/catalogue-sync";
import { stockSyncProcessor } from "./jobs/stock-sync";
import { stellarWatcherProcessor } from "./jobs/stellar-watcher";
import { payoutProcessor } from "./jobs/payout";
import { webhookDeliveryProcessor } from "./jobs/webhook-delivery";
import { refundProcessor } from "./jobs/refund";
import { referralRewardProcessor } from "./jobs/referral-reward/processor";
import { p2pSettlementProcessor } from "./jobs/p2p-settlement";

export const stubProcessor: Processor = async (_job: Job) => {
  return { handled: false, reason: "stub" };
};

const processors: Partial<Record<QueueName, Processor>> = {
  "catalogue-sync": catalogueSyncProcessor,
  "stock-sync": stockSyncProcessor,
  "stellar-watcher": stellarWatcherProcessor,
  payout: payoutProcessor,
  "webhook-delivery": webhookDeliveryProcessor,
  refund: refundProcessor,
  "referral-reward": referralRewardProcessor,
  "p2p-settlement": p2pSettlementProcessor,
};

export function registeredQueueNames(): QueueName[] {
  return [...QUEUE_NAMES];
}

export function startWorkers(): Worker[] {
  return QUEUE_NAMES.map((name) => registerWorker(name, processors[name] ?? stubProcessor));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const workers = startWorkers();
  console.log(`worker ready: ${workers.length} queues registered (${QUEUE_NAMES.join(", ")})`);

  // Stellar watcher is a poller; enqueue a job every 5s so pending orders are detected.
  setInterval(() => {
    getQueue("stellar-watcher")
      .add("poll", {})
      .catch((err) => console.error("failed to enqueue stellar-watcher poll", err));
  }, 5000);
}
