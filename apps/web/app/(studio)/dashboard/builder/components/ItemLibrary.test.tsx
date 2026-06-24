// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { ItemLibrary } from "./ItemLibrary";

const items = [
  { id: "i1", name: "Sword Skin", price: { amount: "1.0000000", currency: "USDT" }, imageUrl: "/s.png", stock: null, rarity: "LEGENDARY" },
  { id: "i2", name: "Shield", price: { amount: "2.0000000", currency: "USDT" }, imageUrl: "/h.png", stock: 5, rarity: "RARE" },
] as any;

afterEach(cleanup);

function renderLib(props: Partial<React.ComponentProps<typeof ItemLibrary>> = {}) {
  return render(
    <DndContext>
      <ItemLibrary items={items} placedItemIds={["i2"]} onAdd={vi.fn()} onSelect={vi.fn()} {...props} />
    </DndContext>,
  );
}

describe("ItemLibrary", () => {
  it("lists every synced item", () => {
    renderLib();
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText("Shield")).toBeInTheDocument();
  });

  it("marks already-placed items", () => {
    renderLib();
    expect(screen.getByTestId("lib-item-i2")).toHaveAttribute("data-placed", "true");
    expect(screen.getByTestId("lib-item-i1")).toHaveAttribute("data-placed", "false");
  });

  it("calls onAdd when the ADD button is clicked", () => {
    const onAdd = vi.fn();
    renderLib({ onAdd });
    fireEvent.click(screen.getByTestId("lib-add-i1"));
    expect(onAdd).toHaveBeenCalledWith("i1");
  });

  it("calls onSelect when an item row is clicked", () => {
    const onSelect = vi.fn();
    renderLib({ onSelect });
    fireEvent.click(screen.getByTestId("lib-item-i1"));
    expect(onSelect).toHaveBeenCalledWith("i1");
  });
});
