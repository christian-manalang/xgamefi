import type { ItemDto } from "@xgamefi/shared/dto";

const RARITY_CLASS: Record<string, string> = {
  LEGENDARY: "bg-primary-fixed text-on-primary-fixed",
  EPIC: "bg-secondary-container text-on-secondary-container",
  MYTHIC: "bg-secondary-container text-on-secondary-container",
  RARE: "bg-tertiary-container text-on-tertiary-container",
  LIMITED: "bg-error-container text-on-error-container",
};

export function ItemRow({ item }: { item: ItemDto }) {
  return (
    <div className="bg-surface-container-low border-2 border-outline-variant p-4 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-display text-[24px] leading-7 font-semibold text-on-surface">{item.name}</span>
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">{item.externalId}</span>
      </div>
      <div className="flex items-center gap-4">
        {item.rarity ? (
          <span className={`font-mono uppercase tracking-[0.1em] text-[10px] px-2 py-1 ${RARITY_CLASS[item.rarity] ?? "bg-surface-container-high text-on-surface-variant"}`}>
            {item.rarity}
          </span>
        ) : null}
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          {item.stock === null ? "UNLIMITED" : `STOCK ${item.stock}`}
        </span>
        <span className="font-display text-[24px] font-semibold text-primary-fixed">
          {item.price.amount} <span className="text-[12px] font-mono">{item.price.currency}</span>
        </span>
      </div>
    </div>
  );
}
