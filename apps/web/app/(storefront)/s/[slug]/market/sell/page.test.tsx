// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ShopDto } from "@xgamefi/shared/dto";

const mocks = vi.hoisted(() => ({
  getPublishedShop: vi.fn(),
  getStudioBrand: vi.fn(),
  getPrincipal: vi.fn(),
  getMySellableItems: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/catalogue-queries", () => ({
  getPublishedShop: mocks.getPublishedShop,
  getStudioBrand: mocks.getStudioBrand,
}));

vi.mock("@/lib/auth/guards", () => ({
  getPrincipal: mocks.getPrincipal,
}));

vi.mock("@/lib/p2p-queries", () => ({
  getMySellableItems: mocks.getMySellableItems,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn() }),
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

beforeEach(() => {
  mocks.getPublishedShop.mockReset().mockResolvedValue(shop);
  mocks.getStudioBrand.mockReset().mockResolvedValue({ name: "Gridlock Games" });
  mocks.getPrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  mocks.getMySellableItems.mockReset().mockResolvedValue([
    { itemId: "i1", name: "Sword Skin", imageUrl: null, rarity: "LEGENDARY", category: "skins", quantity: 3 },
  ]);
  mocks.notFound.mockReset().mockImplementation(() => {
    throw new Error("NOT_FOUND");
  });
});

afterEach(cleanup);

describe("/s/[slug]/market/sell", () => {
  it("renders the sell page with owned items", async () => {
    render(await Page({ params: Promise.resolve({ slug: "gridlock" }) }));

    expect(screen.getByText("Sell Item")).toBeInTheDocument();
    expect(screen.getAllByText("Sword Skin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Qty: 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create listing/i })).toBeInTheDocument();
  });

  it("calls notFound when the shop is not published", async () => {
    mocks.getPublishedShop.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("shows wallet-required state when not authenticated as a player", async () => {
    mocks.getPrincipal.mockResolvedValue(null);
    render(await Page({ params: Promise.resolve({ slug: "gridlock" }) }));

    expect(screen.getByText(/wallet required/i)).toBeInTheDocument();
    expect(screen.queryByText("Sword Skin")).not.toBeInTheDocument();
  });

  it("shows empty state when the player owns no unlocked items", async () => {
    mocks.getMySellableItems.mockResolvedValue([]);
    render(await Page({ params: Promise.resolve({ slug: "gridlock" }) }));

    expect(screen.getByText(/no items available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create listing/i })).not.toBeInTheDocument();
  });
});
