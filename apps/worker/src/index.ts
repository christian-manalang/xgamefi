import type { Job, Processor, Worker } from "bullmq";
import { QUEUE_NAMES, registerWorker, type QueueName } from "@xgamefi/shared/queues";

// Phase 0: every queue gets a no-op stub processor. Phases 2–6 replace these.
export const stubProcessor: Processor = async (_job: Job) => {
  return { handled: false, reason: "stub" };
};

export function registeredQueueNames(): QueueName[] {
  return [...QUEUE_NAMES];
}

export function startWorkers(): Worker[] {
  return QUEUE_NAMES.map((name) => registerWorker(name, stubProcessor));
}

// Only auto-start when run as the entrypoint, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const workers = startWorkers();
  console.log(`worker ready: ${workers.length} queues registered (${QUEUE_NAMES.join(", ")})`);
}
