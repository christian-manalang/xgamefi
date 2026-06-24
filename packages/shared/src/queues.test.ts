import { describe, it, expect, vi } from "vitest";

vi.mock("@xgamefi/config/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));

import { getQueue, registerWorker, type QueueName } from "./queues";

describe("queues", () => {
  it("returns the same Queue instance for the same name", () => {
    const a = getQueue("payout" as QueueName);
    const b = getQueue("payout" as QueueName);
    expect(a).toBe(b);
  });

  it("returns different Queue instances for different names", () => {
    const a = getQueue("payout" as QueueName);
    const b = getQueue("webhook-delivery" as QueueName);
    expect(a).not.toBe(b);
  });

  it("registers a worker", () => {
    const worker = registerWorker("payout" as QueueName, async () => "ok");
    expect(worker).toBeDefined();
    worker.close();
  });
});
