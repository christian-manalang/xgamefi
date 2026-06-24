import { describe, it, expect } from "vitest";
import { OrderEventsParams } from "./order";

describe("OrderEventsParams", () => {
  it("accepts a uuid id", () => {
    expect(OrderEventsParams.parse({ id: "11111111-1111-1111-1111-111111111111" }).id).toBe("11111111-1111-1111-1111-111111111111");
  });
  it("rejects non-uuid", () => {
    expect(() => OrderEventsParams.parse({ id: "nope" })).toThrow();
  });
});
