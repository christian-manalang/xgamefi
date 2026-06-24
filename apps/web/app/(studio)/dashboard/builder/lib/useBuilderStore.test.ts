import { describe, it, expect } from "vitest";
import { builderReducer, type BuilderState } from "./useBuilderStore";

const i1 = "11111111-1111-1111-1111-111111111111";
const i2 = "22222222-2222-2222-2222-222222222222";

const base: BuilderState = {
  layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1] }] },
  featuredItemIds: [],
  selectedItemId: null,
};

describe("builderReducer", () => {
  it("SET_MODE toggles grid/list", () => {
    expect(builderReducer(base, { type: "SET_MODE", mode: "list" }).layout.mode).toBe("list");
  });

  it("ADD_ITEM appends to a section without duplicating", () => {
    const s1 = builderReducer(base, { type: "ADD_ITEM", sectionId: "all", itemId: i2 });
    expect(s1.layout.sections[0]!.itemIds).toEqual([i1, i2]);
    const s2 = builderReducer(s1, { type: "ADD_ITEM", sectionId: "all", itemId: i1 });
    expect(s2.layout.sections[0]!.itemIds).toEqual([i1, i2]);
  });

  it("REMOVE_ITEM drops the item from every section and from featured", () => {
    const seeded: BuilderState = { ...base, featuredItemIds: [i1] };
    const out = builderReducer(seeded, { type: "REMOVE_ITEM", itemId: i1 });
    expect(out.layout.sections[0]!.itemIds).toEqual([]);
    expect(out.featuredItemIds).toEqual([]);
  });

  it("REORDER moves an item within a section", () => {
    const seeded: BuilderState = {
      ...base,
      layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1, i2] }] },
    };
    const out = builderReducer(seeded, { type: "REORDER", sectionId: "all", from: 0, to: 1 });
    expect(out.layout.sections[0]!.itemIds).toEqual([i2, i1]);
  });

  it("TOGGLE_FEATURED adds then removes", () => {
    const on = builderReducer(base, { type: "TOGGLE_FEATURED", itemId: i1 });
    expect(on.featuredItemIds).toEqual([i1]);
    const off = builderReducer(on, { type: "TOGGLE_FEATURED", itemId: i1 });
    expect(off.featuredItemIds).toEqual([]);
  });

  it("SELECT_ITEM sets the selected id", () => {
    expect(builderReducer(base, { type: "SELECT_ITEM", itemId: i1 }).selectedItemId).toBe(i1);
  });
});
