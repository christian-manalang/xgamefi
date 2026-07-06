"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ShopLayout } from "@xgamefi/shared";
import type { ItemDto } from "@xgamefi/shared/dto";

export type LayoutCanvasProps = {
  layout: ShopLayout;
  items: ItemDto[];
  featuredItemIds: string[];
  selectedItemId: string | null;
  onSetMode: (mode: "grid" | "list") => void;
  onRemove: (itemId: string) => void;
  onToggleFeatured: (itemId: string) => void;
  onSelect: (itemId: string) => void;
};

export function LayoutCanvas(props: LayoutCanvasProps) {
  const { layout, items, featuredItemIds, selectedItemId, onSetMode, onRemove, onToggleFeatured, onSelect } = props;
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop" });
  const byId = new Map(items.map((i) => [i.id, i]));
  const featured = new Set(featuredItemIds);

  return (
    <section className="flex flex-1 flex-col gap-4 overflow-y-auto bg-surface p-6">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">LAYOUT</span>
        <button
          type="button"
          data-testid="mode-grid"
          onClick={() => onSetMode("grid")}
          className={`border-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${layout.mode === "grid" ? "border-primary-fixed text-primary-fixed" : "border-outline"}`}
        >
          GRID
        </button>
        <button
          type="button"
          data-testid="mode-list"
          onClick={() => onSetMode("list")}
          className={`border-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${layout.mode === "list" ? "border-primary-fixed text-primary-fixed" : "border-outline"}`}
        >
          LIST
        </button>
      </div>

      <div
        ref={setNodeRef}
        data-testid="canvas"
        data-mode={layout.mode}
        className={`min-h-64 border-2 border-dashed p-4 ${isOver ? "border-primary-fixed" : "border-outline-variant"} ${layout.mode === "grid" ? "grid grid-cols-2 gap-gutter md:grid-cols-3" : "flex flex-col gap-gutter"}`}
      >
        {layout.sections.flatMap((s) => s.itemIds).map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          const isFeatured = featured.has(id);
          return (
            <div
              key={id}
              data-testid={`canvas-card-${id}`}
              data-featured={isFeatured}
              onClick={() => onSelect(id)}
              className={`relative border-2 bg-surface-container-low p-2 ${selectedItemId === id ? "border-primary-fixed" : isFeatured ? "border-secondary-container" : "border-outline-variant"}`}
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-surface-container-high font-mono text-[10px] uppercase text-on-surface-variant">NO IMAGE</div>
              )}
              <p className="font-display text-on-surface">{item.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">
                {item.price.amount} {item.price.currency}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">
                {item.stock === null ? "∞ stock" : `${item.stock} left`}
                {!item.isListed && " · HIDDEN"}
              </p>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  data-testid={`canvas-feature-${id}`}
                  onClick={(e) => { e.stopPropagation(); onToggleFeatured(id); }}
                  className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${isFeatured ? "border-secondary-container text-secondary-container" : "border-outline"}`}
                >
                  {isFeatured ? "FEATURED" : "FEATURE"}
                </button>
                <button
                  type="button"
                  data-testid={`canvas-remove-${id}`}
                  onClick={(e) => { e.stopPropagation(); onRemove(id); }}
                  className="border border-outline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] hover:border-error hover:text-error"
                >
                  REMOVE
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
