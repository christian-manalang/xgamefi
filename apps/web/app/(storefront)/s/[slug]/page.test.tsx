// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ItemDto, ShopDto } from "@xgamefi/shared/dto";

const mocks = vi.hoisted(() => ({
  getPublishedShop: vi.fn(),
  getShopItems: vi.fn(),
  getShopFilterOptions: vi.fn(),
  getStudioBrand: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("../../../../lib/catalogue-queries", () => ({
  getPublishedShop: mocks.getPublishedShop,
  getShopItems: mocks.getShopItems,
  getShopFilterOptions: mocks.getShopFilterOptions,
  getStudioBrand: mocks.getStudioBrand,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/s/gridlock",
  useSearchParams: () => new URLSearchParams(),
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
  description: "blade",
  imageUrl: null,
  price: { amount: "1.0000000", currency: "USDT" },
  stock: null,
  rarity: "LEGENDARY",
  category: "skins",
  metadata: {},
  isActive: true,
  syncedAt: null,
};

beforeEach(() => {
  mocks.getPublishedShop.mockReset().mockResolvedValue(shop);
  mocks.getShopItems.mockReset().mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 24 });
  mocks.getShopFilterOptions.mockReset().mockResolvedValue({ categories: ["skins"], rarities: ["LEGENDARY"] });
  mocks.getStudioBrand.mockReset().mockResolvedValue({ name: "Gridlock Games" });
  mocks.notFound.mockReset().mockImplementation(() => {
    throw new Error("NOT_FOUND");
  });
});

afterEach(cleanup);

describe("/s/[slug]", () => {
  it("renders the shop with items and pagination info", async () => {
    render(await Page({ params: Promise.resolve({ slug: "gridlock" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Gridlock Games")).toBeInTheDocument();
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText(/1 ITEM · PAGE 1 OF 1/)).toBeInTheDocument();
  });

  it("calls notFound when the shop is not published", async () => {
    mocks.getPublishedShop.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ slug: "missing" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  });
});
