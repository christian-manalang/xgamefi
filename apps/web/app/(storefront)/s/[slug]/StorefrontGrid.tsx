"use client";

import { useState } from "react";
import type { ItemDto } from "@xgamefi/shared/dto";
import type { ShopLayout, ShopTheme } from "@xgamefi/shared";
import { ItemCard } from "./_components/item-card";
import { ItemModal } from "./_components/item-modal";

export function StorefrontGrid({
  layout,
  theme,
  featuredItemIds,
  items,
  slug,
}: {
  layout: ShopLayout;
  theme: ShopTheme;
  featuredItemIds: string[];
  items: ItemDto[];
  slug: string;
}) {
  const [selected, setSelected] = useState<ItemDto | null>(null);
  const featured = new Set(featuredItemIds);

  const orderedIds = layout.sections.flatMap((s) => s.itemIds);
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((i): i is ItemDto => i !== undefined);

  // Fallback: if layout is empty, render all items.
  const displayItems = ordered.length ? ordered : items;
  const sorted = [...displayItems].sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)));

  const style = theme.primary ? ({ ["--color-primary-fixed" as string]: theme.primary } as React.CSSProperties) : undefined;

  if (sorted.length === 0) {
    return (
      <div
        data-testid="storefront-grid"
        data-mode={layout.mode}
        style={style}
        className={
          layout.mode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "flex flex-col gap-4"
        }
      >
        <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          No items match the current filters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        data-testid="storefront-grid"
        data-mode={layout.mode}
        style={style}
        className={
          layout.mode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "flex flex-col gap-4"
        }
      >
        {sorted.map((item) => (
          <ItemCard key={item.id} item={item} onSelect={setSelected} />
        ))}
      </div>
      <ItemModal item={selected} slug={slug} onClose={() => setSelected(null)} />
    </>
  );
}
