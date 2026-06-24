import { describe, it, expect } from "vitest";
import { RemoteItemsSchema, ItemOverrideInput, ShopItemsQuery } from "./catalogue";

describe("RemoteItemsSchema", () => {
  it("accepts the SPEC §10 shape", () => {
    const parsed = RemoteItemsSchema.parse([
      { externalId: "sword_skin_01", name: "Sword Skin", description: "x",
        imageUrl: "https://cdn.example.com/s.png", price: "1.0000000",
        currency: "USDT", stock: null, metadata: { dmg: 10 } },
    ]);
    const first = parsed[0];
    expect(first).toBeDefined();
    expect(first!.externalId).toBe("sword_skin_01");
    expect(first!.price).toBe("1.0000000");
  });

  it("rejects an unknown currency", () => {
    expect(() => RemoteItemsSchema.parse([
      { externalId: "x", name: "X", price: "1", currency: "BTC" },
    ])).toThrow();
  });

  it("rejects a non-numeric price string", () => {
    expect(() => RemoteItemsSchema.parse([
      { externalId: "x", name: "X", price: "free", currency: "XLM" },
    ])).toThrow();
  });
});

describe("ItemOverrideInput", () => {
  it("accepts partial overrides", () => {
    const v = ItemOverrideInput.parse({ priceAmount: "2.5", featured: true });
    expect(v.priceAmount).toBe("2.5");
    expect(v.featured).toBe(true);
  });
  it("rejects an empty object (at least one field required)", () => {
    expect(() => ItemOverrideInput.parse({})).toThrow();
  });
});

describe("ShopItemsQuery", () => {
  it("applies defaults and coerces page numbers", () => {
    const v = ShopItemsQuery.parse({ q: "sword", page: "2" });
    expect(v).toMatchObject({ q: "sword", page: 2, pageSize: 24 });
  });
  it("caps pageSize at 60", () => {
    expect(() => ShopItemsQuery.parse({ pageSize: "100" })).toThrow();
  });
});
