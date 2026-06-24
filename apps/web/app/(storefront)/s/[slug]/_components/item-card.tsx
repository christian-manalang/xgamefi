"use client";

import type { ItemDto } from "@xgamefi/shared/dto";

const RARITY_CLASS: Record<string, string> = {
  LEGENDARY: "bg-primary-fixed text-on-primary-fixed",
  EPIC: "bg-secondary-container text-on-secondary-container",
  MYTHIC: "bg-secondary-container text-on-secondary-container",
  RARE: "bg-tertiary-container text-on-tertiary-container",
  LIMITED: "bg-error-container text-on-error-container",
};

export function ItemCard({ item, onSelect }: { item: ItemDto; onSelect?: (item: ItemDto) => void }) {
  return (
    <article className="bg-surface-container-low border-2 border-outline-variant p-4 flex flex-col gap-3 transition-colors hover:border-primary-fixed">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full aspect-square object-cover bg-surface-container-high"
        />
      ) : (
        <div className="w-full aspect-square bg-surface-container-high flex items-center justify-center font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          No Image
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[24px] leading-7 font-semibold text-on-surface">{item.name}</h3>
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">{item.externalId}</span>
      </div>

      <div className="flex items-center justify-between mt-auto">
        {item.rarity ? (
          <span
            className={`font-mono uppercase tracking-[0.1em] text-[10px] px-2 py-1 ${
              RARITY_CLASS[item.rarity] ?? "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            {item.rarity}
          </span>
        ) : (
          <span />
        )}
        <span className="font-display text-[24px] font-semibold text-primary-fixed">
          {item.price.amount} <span className="text-[12px] font-mono">{item.price.currency}</span>
        </span>
      </div>

      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="mt-1 w-full bg-primary-fixed text-on-primary-fixed font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 hover:bg-primary-fixed-dim transition-colors"
        >
          Quick View
        </button>
      ) : null}
    </article>
  );
}
