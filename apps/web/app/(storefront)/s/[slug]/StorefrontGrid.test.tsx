// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { StorefrontGrid } from "./StorefrontGrid";

afterEach(cleanup);
const items = [
  {
    id: "i1",
    name: "Sword Skin",
    price: { amount: "1.0000000", currency: "USDT" },
    imageUrl: "/s.png",
    rarity: "LEGENDARY",
  },
  {
    id: "i2",
    name: "Shield",
    price: { amount: "2.0000000", currency: "USDT" },
    imageUrl: "/h.png",
    rarity: "RARE",
  },
] as any;

describe("StorefrontGrid contract", () => {
  it("renders grid mode with a grid container", () => {
    render(
      <StorefrontGrid
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: ["i1", "i2"] }] }}
        theme={{ primary: "#c3f400" }}
        featuredItemIds={["i2"]}
        items={items}
        slug="gridlock"
      />,
    );
    expect(screen.getByTestId("storefront-grid")).toHaveAttribute("data-mode", "grid");
  });

  it("renders featured items before non-featured", () => {
    render(
      <StorefrontGrid
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: ["i1", "i2"] }] }}
        theme={{}}
        featuredItemIds={["i2"]}
        items={items}
        slug="gridlock"
      />,
    );
    const cards = screen.getAllByText(/Sword Skin|Shield/);
    expect(cards[0]).toHaveTextContent("Shield");
  });

  it("does not fall back to all items when the layout omits the filtered items", () => {
    render(
      <StorefrontGrid
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: ["i1"] }] }}
        theme={{}}
        featuredItemIds={[]}
        items={[items[1]]}
        slug="gridlock"
      />,
    );
    expect(screen.queryByText("Sword Skin")).not.toBeInTheDocument();
    expect(screen.queryByText("Shield")).not.toBeInTheDocument();
    expect(screen.getByText(/No items match the current filters/i)).toBeInTheDocument();
  });

  it("renders all items when the layout has no section itemIds", () => {
    render(
      <StorefrontGrid
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [] }] }}
        theme={{}}
        featuredItemIds={[]}
        items={items}
        slug="gridlock"
      />,
    );
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText("Shield")).toBeInTheDocument();
  });

  it("applies theme primary color via CSS var", () => {
    render(
      <StorefrontGrid layout={{ mode: "list", sections: [] }} theme={{ primary: "#fe00fe" }} featuredItemIds={[]} items={[]} slug="gridlock" />,
    );
    expect(screen.getByTestId("storefront-grid")).toHaveStyle({ "--color-primary-fixed": "#fe00fe" });
  });
});
