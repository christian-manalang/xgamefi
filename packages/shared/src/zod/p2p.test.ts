import { describe, it, expect } from "vitest";
import { CreateListingInput, P2PTradeQuoteInput, P2PTradeSubmitInput, P2PListingsQuery } from "./p2p";

describe("CreateListingInput", () => {
  it("accepts a valid listing", () => {
    const v = CreateListingInput.parse({ itemId: "11111111-1111-1111-1111-111111111111", price: "2.5", currency: "USDT" });
    expect(v.price).toBe("2.5");
  });
  it("rejects non-numeric price", () => {
    expect(() => CreateListingInput.parse({ itemId: "11111111-1111-1111-1111-111111111111", price: "free", currency: "XLM" })).toThrow();
  });
});

describe("P2PTradeQuoteInput / P2PTradeSubmitInput", () => {
  it("validates trade ids and txHash", () => {
    expect(P2PTradeQuoteInput.parse({ listingId: "11111111-1111-1111-1111-111111111111" }).listingId).toBeTruthy();
    expect(P2PTradeSubmitInput.parse({ tradeId: "11111111-1111-1111-1111-111111111111", txHash: "TX" }).txHash).toBe("TX");
  });
});

describe("P2PListingsQuery", () => {
  it("applies defaults", () => {
    const v = P2PListingsQuery.parse({ page: "2" });
    expect(v.page).toBe(2);
    expect(v.pageSize).toBe(24);
  });
});
