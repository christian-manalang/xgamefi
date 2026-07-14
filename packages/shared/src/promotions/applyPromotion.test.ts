import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { applyPromotion, type PromotionInput } from "./applyPromotion";

const D = (s: string) => new Prisma.Decimal(s);
const NOW = new Date("2026-06-23T12:00:00Z");

const base = (over: Partial<PromotionInput>): PromotionInput => ({
  id: "promo-1",
  type: "PERCENT",
  value: D("10"),
  currency: null,
  appliesToItemIds: [],
  bundleConfig: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usageCount: 0,
  isActive: true,
  ...over,
});

describe("applyPromotion", () => {
  it("PERCENT: 10% off a 1.0000000 unit price x1 = 0.1000000 discount", () => {
    const r = applyPromotion({
      promotion: base({ type: "PERCENT", value: D("10") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.1000000");
    expect(r.promotionId).toBe("promo-1");
  });

  it("PERCENT: applies per gross (qty 3 of 2.5 => 7.5 gross, 20% => 1.5)", () => {
    const r = applyPromotion({
      promotion: base({ type: "PERCENT", value: D("20") }),
      itemId: "i1", quantity: 3, unitPrice: D("2.5"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("1.5000000");
  });

  it("FIXED: subtracts a flat amount", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIXED", value: D("0.4"), currency: "USDT" }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.4000000");
  });

  it("FIXED: clamps discount to gross (never negative net)", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIXED", value: D("5"), currency: "USDT" }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("1.0000000");
  });

  it("BUNDLE: prices a matching set (3x1.0 => 3.0 gross, bundlePrice 2.5 => 0.5 off)", () => {
    const r = applyPromotion({
      promotion: base({ type: "BUNDLE", bundleConfig: { itemId: "i1", quantity: 3, bundlePrice: "2.5" } }),
      itemId: "i1", quantity: 3, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.5000000");
  });

  it("BUNDLE: no discount when quantity does not match the bundle set", () => {
    const r = applyPromotion({
      promotion: base({ type: "BUNDLE", bundleConfig: { itemId: "i1", quantity: 3, bundlePrice: "2.5" } }),
      itemId: "i1", quantity: 2, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    expect(r.promotionId).toBeUndefined();
  });

  it("FIRST_PURCHASE: applies (as percent) when player has no prior PAID order", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIRST_PURCHASE", value: D("50") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.5000000");
    expect(r.promotionId).toBe("promo-1");
  });

  it("FIRST_PURCHASE: gated off when player already has a PAID order", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIRST_PURCHASE", value: D("50") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: true,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    expect(r.promotionId).toBeUndefined();
  });

  it("respects endsAt: expired promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ endsAt: new Date("2026-06-22T00:00:00Z") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    expect(r.promotionId).toBeUndefined();
  });

  it("respects startsAt: not-yet-active promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ startsAt: new Date("2026-06-24T00:00:00Z") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("respects usageLimit: exhausted promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ usageLimit: 5, usageCount: 5 }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("respects appliesToItemIds: non-matching item yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ appliesToItemIds: ["other-item"] }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("inactive promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ isActive: false }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("rounds discount DOWN to 7dp", () => {
    const r = applyPromotion({
      promotion: base({ type: "PERCENT", value: D("33.333333") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.3333333");
  });

  describe("coupon gating", () => {
    it("code-gated promo does NOT apply when caller provides no code", () => {
      const r = applyPromotion({
        promotion: base({ code: "SUMMER10", type: "PERCENT", value: D("10") }),
        itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
      });
      expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
      expect(r.promotionId).toBeUndefined();
    });

    it("code-gated promo applies when caller provides the matching code", () => {
      const r = applyPromotion({
        promotion: base({ code: "SUMMER10", type: "PERCENT", value: D("10") }),
        itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
        promotionCode: "SUMMER10",
      });
      expect(r.discountAmount.toFixed(7)).toBe("0.1000000");
      expect(r.promotionId).toBe("promo-1");
    });

    it("code matching is case-insensitive", () => {
      const r = applyPromotion({
        promotion: base({ code: "SUMMER10", type: "PERCENT", value: D("10") }),
        itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
        promotionCode: "summer10",
      });
      expect(r.discountAmount.toFixed(7)).toBe("0.1000000");
    });

    it("code-gated promo does NOT apply when caller provides a different code", () => {
      const r = applyPromotion({
        promotion: base({ code: "SUMMER10", type: "PERCENT", value: D("10") }),
        itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
        promotionCode: "WINTER20",
      });
      expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    });

    it("auto-apply promo (code=null) does NOT apply when caller provides a code", () => {
      const r = applyPromotion({
        promotion: base({ code: null, type: "PERCENT", value: D("10") }),
        itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
        promotionCode: "ANYTHING",
      });
      expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    });
  });
});
