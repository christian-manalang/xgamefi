"use client";

import { useState } from "react";
import type { ItemDto } from "@xgamefi/shared/dto";
import { ItemCard } from "./item-card";
import { ItemModal } from "./item-modal";

export function StorefrontGrid({ items, slug }: { items: ItemDto[]; slug: string }) {
  const [selected, setSelected] = useState<ItemDto | null>(null);

  if (items.length === 0) {
    return (
      <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
        No items match the current filters.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onSelect={setSelected} />
        ))}
      </div>
      <ItemModal item={selected} slug={slug} onClose={() => setSelected(null)} />
    </>
  );
}
