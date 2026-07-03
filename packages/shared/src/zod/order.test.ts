import { describe, it, expect } from "vitest";
import { OrderEventsParams, StudioOrdersQuery } from "./order";

describe("OrderEventsParams", () => {
  it("accepts a uuid id", () => {
    expect(OrderEventsParams.parse({ id: "11111111-1111-1111-1111-111111111111" }).id).toBe("11111111-1111-1111-1111-111111111111");
  });
  it("rejects non-uuid", () => {
    expect(() => OrderEventsParams.parse({ id: "nope" })).toThrow();
  });
});

describe("StudioOrdersQuery", () => {
  it("accepts valid status filters and cursor", () => {
    const q = StudioOrdersQuery.parse({
      paymentStatus: "PAID",
      deliveryStatus: "DELIVERED",
      cursor: "11111111-1111-1111-1111-111111111111",
      limit: "10",
    });
    expect(q.paymentStatus).toBe("PAID");
    expect(q.deliveryStatus).toBe("DELIVERED");
    expect(q.cursor).toBe("11111111-1111-1111-1111-111111111111");
    expect(q.limit).toBe(10);
  });

  it("defaults limit to 50", () => {
    const q = StudioOrdersQuery.parse({});
    expect(q.limit).toBe(50);
    expect(q.paymentStatus).toBeUndefined();
  });

  it("rejects invalid status values", () => {
    expect(() => StudioOrdersQuery.parse({ paymentStatus: "SHIPPED" })).toThrow();
    expect(() => StudioOrdersQuery.parse({ deliveryStatus: "CANCELLED" })).toThrow();
  });

  it("rejects non-uuid cursor", () => {
    expect(() => StudioOrdersQuery.parse({ cursor: "nope" })).toThrow();
  });

  it("rejects unknown query params", () => {
    expect(() => StudioOrdersQuery.parse({ foo: "bar" })).toThrow();
  });
});
