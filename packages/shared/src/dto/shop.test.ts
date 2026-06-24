import { describe, it, expect } from "vitest";
import { toShopDto } from "./shop";

const row = {
  studioId: "22222222-2222-2222-2222-222222222222",
  status: "PUBLISHED" as const,
  layout: { mode: "grid", sections: [{ id: "main", itemIds: ["i1", "i2"] }] },
  draftLayout: { mode: "list", sections: [] },
  theme: { primaryFixed: "#c3f400" },
  featuredItemIds: ["i1"],
  publishedAt: new Date("2026-06-23T12:00:00.000Z"),
  studio: { slug: "gridlock" },
};

describe("toShopDto", () => {
  it("maps published config, omits draftLayout, serializes date", () => {
    expect(toShopDto(row)).toEqual({
      studioId: row.studioId,
      slug: "gridlock",
      status: "PUBLISHED",
      layout: { mode: "grid", sections: [{ id: "main", itemIds: ["i1", "i2"] }] },
      theme: { primaryFixed: "#c3f400" },
      featuredItemIds: ["i1"],
      publishedAt: "2026-06-23T12:00:00.000Z",
    });
  });

  it("defaults a null/invalid layout to an empty grid", () => {
    const dto = toShopDto({ ...row, layout: null });
    expect(dto.layout).toEqual({ mode: "grid", sections: [] });
  });
});
