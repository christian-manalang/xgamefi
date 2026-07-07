// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShopBuilder } from "./ShopBuilder";

const i1 = "11111111-1111-1111-1111-111111111111";
const shop = {
  id: "shop-1", studioId: "stu-1", slug: "gridlock", status: "DRAFT" as const,
  layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [] }] },
  draftLayout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1] }] },
  theme: { primary: "#c3f400" }, featuredItemIds: [], publishedAt: null,
};
const items = [{
  id: i1, name: "Sword Skin", price: { amount: "1.0000000", currency: "USDT" },
  imageUrl: "/s.png", stock: null, rarity: "LEGENDARY", metadata: {},
}] as any;

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

describe("ShopBuilder", () => {
  it("renders all three panels + preview", () => {
    render(<ShopBuilder shop={shop as any} items={items} />);
    expect(screen.getByTestId("config-empty")).toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByText("ITEM_LIBRARY")).toBeInTheDocument();
    fireEvent.click(screen.getByText("SHOW_PREVIEW ▼"));
    expect(screen.getAllByTestId("storefront-grid").length).toBeGreaterThan(0);
  });

  it("seeds the canvas from draftLayout", () => {
    render(<ShopBuilder shop={shop as any} items={items} />);
    expect(screen.getByTestId(`canvas-card-${i1}`)).toBeInTheDocument();
  });

  it("SAVE_DRAFT PUTs layout/theme/featured", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ shop }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<ShopBuilder shop={shop as any} items={items} />);
    fireEvent.click(screen.getByTestId("builder-save-draft"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/studios/stu-1/shop/draft");
    expect(init?.method).toBe("PUT");
    const body = JSON.parse(init!.body as string);
    expect(body.layout.sections[0].itemIds).toEqual([i1]);
    expect(body.theme.primary).toBe("#c3f400");
  });

  it("PUBLISH POSTs to the publish endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ shop: { ...shop, status: "PUBLISHED" } }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<ShopBuilder shop={shop as any} items={items} />);
    fireEvent.click(screen.getByTestId("builder-publish"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/studios/stu-1/shop/publish", expect.objectContaining({ method: "POST" })));
  });
});
