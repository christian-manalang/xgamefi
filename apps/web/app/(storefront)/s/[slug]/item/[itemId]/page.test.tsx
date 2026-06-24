// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ItemDto, ShopDto } from "@xgamefi/shared/dto";

const mocks = vi.hoisted(() => ({
  getPublicItem: vi.fn(),
  getPublishedShop: vi.fn(),
  getStudioBrand: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("../../../../../../lib/catalogue-queries", () => ({
  getPublicItem: mocks.getPublicItem,
  getPublishedShop: mocks.getPublishedShop,
  getStudioBrand: mocks.getStudioBrand,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import Page from "./page";

const shop: ShopDto = {
  id: "shop-1",
  studioId: "stu1",
  slug: "gridlock",
  status: "PUBLISHED",
  layout: { mode: "grid", sections: [] },
  draftLayout: null,
  theme: {},
  featuredItemIds: [],
  publishedAt: new Date().toISOString(),
};

const item: ItemDto = {
  id: "i1",
  studioId: "stu1",
  externalId: "sword_skin_01",
  name: "Sword Skin",
  description: "A legendary blade skin.",
  imageUrl: null,
  price: { amount: "1.0000000", currency: "USDT" },
  stock: 100,
  rarity: "LEGENDARY",
  category: "skins",
  metadata: { dmg: 10 },
  isActive: true,
  syncedAt: null,
};

beforeEach(() => {
  mocks.getPublicItem.mockReset().mockResolvedValue(item);
  mocks.getPublishedShop.mockReset().mockResolvedValue(shop);
  mocks.getStudioBrand.mockReset().mockResolvedValue({ name: "Gridlock Games" });
  mocks.notFound.mockReset().mockImplementation(() => {
    throw new Error("NOT_FOUND");
  });
});

afterEach(cleanup);

describe("/s/[slug]/item/[itemId]", () => {
  it("renders the item detail page", async () => {
    render(await Page({ params: Promise.resolve({ slug: "gridlock", itemId: "i1" }) }));

    expect(screen.getByRole("heading", { name: "Sword Skin" })).toBeInTheDocument();
    expect(screen.getByText(/A legendary blade skin/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("STOCK 100")).toBeInTheDocument();
    expect(screen.getByText("Gridlock Games")).toBeInTheDocument();
  });

  it("calls notFound when the item does not exist", async () => {
    mocks.getPublicItem.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ slug: "gridlock", itemId: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });
});
