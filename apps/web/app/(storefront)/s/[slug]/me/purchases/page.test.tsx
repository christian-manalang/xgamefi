// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ShopDto } from "@xgamefi/shared/dto";

const mocks = vi.hoisted(() => ({
  getPublishedShop: vi.fn(),
  getStudioBrand: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/catalogue-queries", () => ({
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

vi.mock("./PurchaseHistoryPanel", () => ({
  PurchaseHistoryPanel: () => <div data-testid="purchase-panel" />,
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
  mocks.notFound.mockReset().mockImplementation(() => {
    throw new Error("NOT_FOUND");
  });
});

afterEach(cleanup);

describe("/s/[slug]/me/purchases", () => {
  it("renders the purchases page with heading and panel", async () => {
    render(await Page({ params: Promise.resolve({ slug: "gridlock" }) }));

    expect(screen.getByRole("heading", { name: "My Purchases" })).toBeInTheDocument();
    expect(screen.getByText("← Back to Shop")).toHaveAttribute("href", "/s/gridlock");
    expect(screen.getByTestId("purchase-panel")).toBeInTheDocument();
  });

  it("calls notFound when the shop is not published", async () => {
    mocks.getPublishedShop.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });
});
