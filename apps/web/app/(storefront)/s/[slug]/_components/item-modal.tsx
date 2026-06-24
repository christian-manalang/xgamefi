"use client";

import { useEffect, useRef } from "react";
import type { ItemDto } from "@xgamefi/shared/dto";

export function ItemModal({ item, onClose }: { item: ItemDto | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
  }, [item]);

  if (!item) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="bg-surface text-on-surface p-0 border-2 border-outline-variant max-w-2xl w-full backdrop:bg-black/80"
      data-testid="item-modal"
    >
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-[32px] leading-9 font-bold text-on-surface">{item.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-on-surface-variant hover:text-on-surface"
          >
            ×
          </button>
        </div>

        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full max-h-80 object-cover bg-surface-container-high" />
        ) : null}

        <p className="text-on-surface-variant">{item.description ?? "No description available."}</p>

        <div className="flex items-center justify-between">
          {item.rarity ? (
            <span className="font-mono uppercase tracking-[0.1em] text-[12px] px-2 py-1 bg-primary-fixed text-on-primary-fixed">
              {item.rarity}
            </span>
          ) : (
            <span />
          )}
          <span className="font-display text-[24px] font-semibold text-primary-fixed">
            {item.price.amount} <span className="text-[12px] font-mono">{item.price.currency}</span>
          </span>
        </div>
      </div>
    </dialog>
  );
}
