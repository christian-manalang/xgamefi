import { describe, it, expect } from "vitest";
import { CheckoutQuoteInput, CheckoutSubmitInput } from "./checkout";

describe("CheckoutQuoteInput", () => {
  it("accepts itemId with default quantity", () => {
    const v = CheckoutQuoteInput.parse({ itemId: "11111111-1111-1111-1111-111111111111" });
    expect(v.quantity).toBe(1);
  });
  it("rejects non-uuid itemId", () => {
    expect(() => CheckoutQuoteInput.parse({ itemId: "nope" })).toThrow();
  });
  it("rejects quantity <= 0", () => {
    expect(() => CheckoutQuoteInput.parse({ itemId: "11111111-1111-1111-1111-111111111111", quantity: 0 })).toThrow();
  });
});

describe("CheckoutSubmitInput", () => {
  it("accepts orderId + txHash", () => {
    const v = CheckoutSubmitInput.parse({ orderId: "11111111-1111-1111-1111-111111111111", txHash: "abc123" });
    expect(v.txHash).toBe("abc123");
  });
});
