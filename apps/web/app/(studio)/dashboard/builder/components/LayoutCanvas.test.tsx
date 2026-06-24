// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { LayoutCanvas } from "./LayoutCanvas";

const i1 = "11111111-1111-1111-1111-111111111111";
const items = [{ id: i1, name: "Sword Skin", price: { amount: "1.0000000", currency: "USDT" }, imageUrl: "/s.png", stock: null, rarity: "LEGENDARY" }] as any;
const layout = { mode: "grid" as const, sections: [{ id: "all", title: "ALL", itemIds: [i1] }] };

afterEach(cleanup);

function renderCanvas(props: Partial<React.ComponentProps<typeof LayoutCanvas>> = {}) {
  return render(
    <DndContext>
      <LayoutCanvas
        layout={layout} items={items} featuredItemIds={[]} selectedItemId={null}
        onSetMode={vi.fn()} onRemove={vi.fn()} onToggleFeatured={vi.fn()} onSelect={vi.fn()} {...props}
      />
    </DndContext>,
  );
}

describe("LayoutCanvas", () => {
  it("reflects the current mode on the container", () => {
    renderCanvas();
    expect(screen.getByTestId("canvas").dataset.mode).toBe("grid");
  });

  it("toggling to LIST calls onSetMode('list')", () => {
    const onSetMode = vi.fn();
    renderCanvas({ onSetMode });
    fireEvent.click(screen.getByTestId("mode-list"));
    expect(onSetMode).toHaveBeenCalledWith("list");
  });

  it("renders a card per placed item", () => {
    renderCanvas();
    expect(screen.getByTestId(`canvas-card-${i1}`)).toHaveTextContent("Sword Skin");
  });

  it("FEATURE button calls onToggleFeatured with the item id", () => {
    const onToggleFeatured = vi.fn();
    renderCanvas({ onToggleFeatured });
    fireEvent.click(screen.getByTestId(`canvas-feature-${i1}`));
    expect(onToggleFeatured).toHaveBeenCalledWith(i1);
  });

  it("marks a featured card", () => {
    renderCanvas({ featuredItemIds: [i1] });
    expect(screen.getByTestId(`canvas-card-${i1}`).dataset.featured).toBe("true");
  });

  it("REMOVE button calls onRemove", () => {
    const onRemove = vi.fn();
    renderCanvas({ onRemove });
    fireEvent.click(screen.getByTestId(`canvas-remove-${i1}`));
    expect(onRemove).toHaveBeenCalledWith(i1);
  });
});
