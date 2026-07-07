"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ItemDto } from "@xgamefi/shared/dto";

function LibRow({
  item,
  placed,
  onAdd,
  onSelect,
}: {
  item: ItemDto;
  placed: boolean;
  onAdd: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `lib-${item.id}`, data: { itemId: item.id } });
  return (
    <div
      ref={setNodeRef}
      data-testid={`lib-item-${item.id}`}
      data-placed={placed}
      className={`flex items-center gap-3 border-2 border-outline-variant bg-surface-container-low p-2 ${placed ? "opacity-40" : ""}`}
    >
      <div
        className="flex flex-1 cursor-pointer items-center gap-3"
        onClick={() => onSelect(item.id)}
        {...attributes}
        {...listeners}
      >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="aspect-square w-12 object-cover" />
      ) : (
        <div className="flex aspect-square w-12 items-center justify-center bg-surface-container-high font-mono text-[10px] uppercase text-on-surface-variant">NO IMG</div>
      )}
      <div className="flex-1">
        <p className={`font-display ${item.isListed ? "text-on-surface" : "text-on-surface-variant line-through"}`}>{item.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">
          {item.price.amount} {item.price.currency}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">
          {item.stock === null ? "∞ stock" : `${item.stock} left`}
          {item.syncedAt ? ` · synced ${new Date(item.syncedAt).toLocaleDateString()}` : ""}
        </p>
      </div>
      </div>
      <button
        type="button"
        data-testid={`lib-add-${item.id}`}
        disabled={placed}
        onClick={(e) => { e.stopPropagation(); onAdd(item.id); }}
        className={`border-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${placed ? "border-outline-variant text-outline" : "border-outline hover:border-primary-fixed hover:text-primary-fixed"}`}
      >
        {placed ? "PLACED" : "ADD"}
      </button>
    </div>
  );
}

export function ItemLibrary({
  items,
  placedItemIds,
  onAdd,
  onSelect,
}: {
  items: ItemDto[];
  placedItemIds: string[];
  onAdd: (itemId: string) => void;
  onSelect: (itemId: string) => void;
}) {
  const placed = new Set(placedItemIds);
  const sorted = [...items].sort((a, b) => Number(placed.has(a.id)) - Number(placed.has(b.id)));
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-2 overflow-y-auto border-l-2 border-outline-variant bg-surface-container-lowest p-3">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">ITEM_LIBRARY</h2>
      {sorted.map((item) => (
        <LibRow key={item.id} item={item} placed={placed.has(item.id)} onAdd={onAdd} onSelect={onSelect} />
      ))}
    </aside>
  );
}
