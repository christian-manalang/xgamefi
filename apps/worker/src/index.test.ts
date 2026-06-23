import { describe, it, expect } from "vitest";
import { stubProcessor, registeredQueueNames } from "./index";
import { QUEUE_NAMES } from "@xgamefi/shared/queues";

describe("worker bootstrap", () => {
  it("plans a stub worker for every queue name", () => {
    expect(registeredQueueNames().sort()).toEqual([...QUEUE_NAMES].sort());
  });

  it("stubProcessor returns a not-implemented marker for any job", async () => {
    const result = await stubProcessor({ name: "noop", data: {} } as never);
    expect(result).toEqual({ handled: false, reason: "stub" });
  });
});
