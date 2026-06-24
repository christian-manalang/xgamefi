"use client";

import { useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { ShopDto } from "@xgamefi/shared/dto";
import type { ItemDto } from "@xgamefi/shared/dto";
import { useBuilderStore } from "./lib/useBuilderStore";
import { ItemConfigPanel } from "./components/ItemConfigPanel";
import { LayoutCanvas } from "./components/LayoutCanvas";
import { StorefrontPreview } from "./components/StorefrontPreview";
import { ItemLibrary } from "./components/ItemLibrary";

function ensureSection(layout: ShopDto["layout"]): ShopDto["layout"] {
  if (layout.sections.length) return layout;
  return { mode: layout.mode, sections: [{ id: "all", title: "ALL", itemIds: [] }] };
}

export function ShopBuilder({ shop, items }: { shop: ShopDto; items: ItemDto[] }) {
  const initialLayout = ensureSection(shop.draftLayout ?? shop.layout);
  const firstSectionId = initialLayout.sections[0]!.id;
  const { state, dispatch } = useBuilderStore({
    layout: initialLayout,
    featuredItemIds: shop.featuredItemIds,
    selectedItemId: null,
  });
  const [itemMap, setItemMap] = useState<Record<string, ItemDto>>(Object.fromEntries(items.map((i) => [i.id, i])));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allItems = Object.values(itemMap);
  const placedIds = state.layout.sections.flatMap((s) => s.itemIds);
  const selected = state.selectedItemId ? itemMap[state.selectedItemId] ?? null : null;

  function onDragEnd(e: DragEndEvent) {
    const itemId = e.active.data.current?.itemId as string | undefined;
    if (itemId && e.over?.id === "canvas-drop") {
      dispatch({ type: "ADD_ITEM", sectionId: firstSectionId, itemId });
    }
  }

  async function saveDraft() {
    setBusy(true); setStatus(null);
    try {
      const res = await fetch(`/api/v1/studios/${shop.studioId}/shop/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layout: state.layout, theme: shop.theme, featuredItemIds: state.featuredItemIds }),
      });
      setStatus(res.ok ? "DRAFT_SAVED" : "SAVE_FAILED");
    } catch { setStatus("SAVE_FAILED"); } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setStatus(null);
    try {
      await fetch(`/api/v1/studios/${shop.studioId}/shop/draft`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ layout: state.layout, theme: shop.theme, featuredItemIds: state.featuredItemIds }),
      });
      const res = await fetch(`/api/v1/studios/${shop.studioId}/shop/publish`, { method: "POST" });
      setStatus(res.ok ? "PUBLISHED" : "PUBLISH_FAILED");
    } catch { setStatus("PUBLISH_FAILED"); } finally { setBusy(false); }
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-5rem)] flex-col">
        <div className="flex items-center justify-between border-b-2 border-primary px-6 py-3 motion-safe:shadow-[0_0_15px_var(--primary-glow)]">
          <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">SHOP_BUILDER · /s/{shop.slug}</span>
          <div className="flex items-center gap-3">
            {status && <span data-testid="builder-status" className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">{status}</span>}
            <button type="button" data-testid="builder-save-draft" disabled={busy} onClick={saveDraft}
              className="border-2 border-outline px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] hover:border-primary-fixed hover:text-primary-fixed disabled:opacity-50">SAVE_DRAFT</button>
            <button type="button" data-testid="builder-publish" disabled={busy} onClick={publish}
              className="bg-primary-fixed px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-on-primary-fixed active:scale-95 disabled:opacity-50">PUBLISH</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <ItemConfigPanel studioId={shop.studioId} item={selected} onSaved={(u) => setItemMap((m) => ({ ...m, [u.id]: { ...m[u.id], ...u } }))} />
          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <LayoutCanvas
              layout={state.layout} items={allItems} featuredItemIds={state.featuredItemIds} selectedItemId={state.selectedItemId}
              onSetMode={(mode) => dispatch({ type: "SET_MODE", mode })}
              onRemove={(id) => dispatch({ type: "REMOVE_ITEM", itemId: id })}
              onToggleFeatured={(id) => dispatch({ type: "TOGGLE_FEATURED", itemId: id })}
              onSelect={(id) => dispatch({ type: "SELECT_ITEM", itemId: id })}
            />
            <div className="overflow-y-auto px-6 pb-6">
              <StorefrontPreview layout={state.layout} theme={shop.theme} featuredItemIds={state.featuredItemIds} items={allItems} />
            </div>
          </div>
          <ItemLibrary items={allItems} placedItemIds={placedIds}
            onAdd={(id) => dispatch({ type: "ADD_ITEM", sectionId: firstSectionId, itemId: id })}
            onSelect={(id) => dispatch({ type: "SELECT_ITEM", itemId: id })}
          />
        </div>
      </div>
    </DndContext>
  );
}
