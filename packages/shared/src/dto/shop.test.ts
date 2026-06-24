import { describe, it, expect } from "vitest";
import { toShopDto } from "./shop";

const base = {
  id: "shop-1",
  studioId: "22222222-2222-2222-2222-222222222222",
  status: "DRAFT" as const,
  layout: { mode: "grid", sections: [{ id: "main", title: "MAIN", itemIds: ["i1", "i2"] }] },
  draftLayout: { mode: "list", sections: [] },
  theme: { primary: "#c3f400" },
  featuredItemIds: ["i1"],
  publishedAt: null,
  studio: { slug: "gridlock" },
};

describe("toShopDto", () => {
  it("maps published config, includes draftLayout, and serializes date", () => {
    const dto = toShopDto({
      ...base,
      status: "PUBLISHED",
      publishedAt: new Date("2026-06-23T12:00:00.000Z"),
    });
    expect(dto).toEqual({
      id: "shop-1",
      studioId: base.studioId,
      slug: "gridlock",
      status: "PUBLISHED",
      layout: { mode: "grid", sections: [{ id: "main", title: "MAIN", itemIds: ["i1", "i2"] }] },
      draftLayout: { mode: "list", sections: [] },
      theme: { primary: "#c3f400" },
      featuredItemIds: ["i1"],
      publishedAt: "2026-06-23T12:00:00.000Z",
    });
  });

  it("maps draftLayout for the studio view", () => {
    const dto = toShopDto(base);
    expect(dto.slug).toBe("gridlock");
    expect(dto.draftLayout?.mode).toBe("list");
    expect(dto.layout.mode).toBe("grid");
    expect(dto.publishedAt).toBeNull();
  });

  it("returns null draftLayout when absent", () => {
    const dto = toShopDto({ ...base, draftLayout: null });
    expect(dto.draftLayout).toBeNull();
  });

  it("defaults a null/invalid layout to an empty grid", () => {
    const dto = toShopDto({ ...base, layout: null });
    expect(dto.layout).toEqual({ mode: "grid", sections: [] });
  });
});
