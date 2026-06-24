// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { StorefrontPreview } from "./StorefrontPreview";

const i1 = "11111111-1111-1111-1111-111111111111";
const items = [{ id: i1, name: "Sword Skin", price: { amount: "1.0000000", currency: "USDT" }, imageUrl: "/s.png", rarity: "LEGENDARY" }] as any;

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
});
