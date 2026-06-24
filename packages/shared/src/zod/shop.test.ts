import { describe, it, expect } from "vitest";
import { ShopLayoutSchema, ShopDraftInputSchema } from "./shop";

const hex = "#c3f400";
const id = "11111111-1111-1111-1111-111111111111";

describe("ShopLayoutSchema", () => {
  it("accepts a valid grid layout with sections", () => {
    const layout = {
      mode: "grid",
      sections: [{ id: "feat", title: "FEATURED", itemIds: [id] }],
    };
    const parsed = ShopLayoutSchema.parse(layout);
    expect(parsed.mode).toBe("grid");
    expect(parsed.sections[0].itemIds).toEqual([id]);
  });

  it("accepts list mode", () => {
    expect(ShopLayoutSchema.parse({ mode: "list", sections: [] }).mode).toBe("list");
  });

  it("rejects an unknown mode", () => {
    expect(() => ShopLayoutSchema.parse({ mode: "carousel", sections: [] })).toThrow();
  });

  it("rejects a section missing itemIds", () => {
    expect(() =>
      ShopLayoutSchema.parse({ mode: "grid", sections: [{ id: "x", title: "X" }] }),
    ).toThrow();
  });

  it("rejects a non-uuid itemId", () => {
    expect(() =>
      ShopLayoutSchema.parse({ mode: "grid", sections: [{ id: "x", title: "X", itemIds: ["nope"] }] }),
    ).toThrow();
  });
});

describe("ShopDraftInputSchema", () => {
  it("accepts layout + theme + featuredItemIds", () => {
    const parsed = ShopDraftInputSchema.parse({
      layout: { mode: "grid", sections: [] },
      theme: { primary: hex },
      featuredItemIds: [id],
    });
    expect(parsed.featuredItemIds).toEqual([id]);
    expect(parsed.theme.primary).toBe(hex);
  });

  it("rejects a non-hex theme color", () => {
    expect(() =>
      ShopDraftInputSchema.parse({
        layout: { mode: "grid", sections: [] },
        theme: { primary: "lime" },
        featuredItemIds: [],
      }),
    ).toThrow();
  });
});
