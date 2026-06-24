// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../../lib/auth/guards", () => ({
  requireRole: vi.fn().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu-1" }),
}));
vi.mock("@xgamefi/db", () => ({
  prisma: {
    shop: { findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: "shop-1", studioId: "stu-1", status: "DRAFT",
      layout: { mode: "grid", sections: [] }, draftLayout: null, theme: {}, featuredItemIds: [],
      publishedAt: null, studio: { slug: "gridlock" } }) },
    item: { findMany: vi.fn().mockResolvedValue([
      { id: "i1", name: "Sword Skin", priceAmount: { toString: () => "1.0000000" }, priceCurrency: "USDT", imageUrl: "/s.png", stock: null, isActive: true, rarity: "LEGENDARY" }]) },
  },
}));
vi.mock("./ShopBuilder", () => ({
  ShopBuilder: ({ shop, items }: any) => (
    <div data-testid="builder">{shop.slug}:{items.length}</div>
  ),
}));

import BuilderPage from "./page";

describe("BuilderPage", () => {
  it("loads the studio shop + items and renders the builder island", async () => {
    const ui = await BuilderPage();
    render(ui);
    expect(screen.getByTestId("builder")).toHaveTextContent("gridlock:1");
  });
});
