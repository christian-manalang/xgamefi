// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { StorefrontPreview } from "./StorefrontPreview";

const i1 = "11111111-1111-1111-1111-111111111111";
const i2 = "22222222-2222-2222-2222-222222222222";
const items = [
  { id: i1, name: "Sword Skin", price: { amount: "1.0000000", currency: "USDT" }, imageUrl: "/s.png", rarity: "LEGENDARY", isListed: true },
  { id: i2, name: "Hidden Blade", price: { amount: "2.0000000", currency: "USDT" }, imageUrl: "/h.png", rarity: "EPIC", isListed: false },
] as any;

afterEach(cleanup);

describe("StorefrontPreview", () => {
  it("renders the player-facing grid for the current layout", () => {
    render(
      <StorefrontPreview
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1] }] }}
        theme={{ primary: "#c3f400" }}
        featuredItemIds={[i1]}
        items={items}
      />,
    );
    expect(screen.getByTestId("storefront-grid")).toHaveAttribute("data-mode", "grid");
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
  });

  it("reflects list mode immediately", () => {
    render(<StorefrontPreview layout={{ mode: "list", sections: [] }} theme={{}} featuredItemIds={[]} items={[]} />);
    expect(screen.getByTestId("storefront-grid")).toHaveAttribute("data-mode", "list");
  });

  it("hides unlisted items from the player preview", () => {
    render(
      <StorefrontPreview
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1, i2] }] }}
        theme={{ primary: "#c3f400" }}
        featuredItemIds={[]}
        items={items}
      />,
    );
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Blade")).not.toBeInTheDocument();
  });
});
