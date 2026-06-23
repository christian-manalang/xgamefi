import { describe, it, expect } from "vitest";
import { QUEUE_NAMES } from "./queues";

describe("queues registry", () => {
  it("declares all seven SPEC §9 queue names", () => {
    expect([...QUEUE_NAMES].sort()).toEqual(
      [
        "catalogue-sync",
        "p2p-settlement",
        "payout",
        "referral-reward",
        "refund",
        "stellar-watcher",
        "webhook-delivery",
      ].sort(),
    );
  });
});
