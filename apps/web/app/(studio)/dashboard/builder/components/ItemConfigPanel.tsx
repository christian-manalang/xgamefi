"use client";

import { useEffect, useState } from "react";
import type { ItemDto } from "@xgamefi/shared/dto";

export function ItemConfigPanel({
  studioId,
  item,
  onSaved,
}: {
  studioId: string;
  item: ItemDto | null;
  onSaved: (updated: ItemDto) => void;
}) {
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"XLM" | "USDT">("USDT");
  const [stock, setStock] = useState<string>("");
  const [unlimited, setUnlimited] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setPrice(item.price.amount);
    setCurrency(item.price.currency as "XLM" | "USDT");
    setUnlimited(item.stock === null);
    setStock(item.stock === null ? "" : String(item.stock));
    setSaleStartsAt((item.metadata?.saleWindow as { startsAt?: string } | undefined)?.startsAt ?? "");
    setSaleEndsAt((item.metadata?.saleWindow as { endsAt?: string } | undefined)?.endsAt ?? "");
  }, [item]);

  if (!item) {
    return (
      <aside className="w-64 shrink-0 border-r-2 border-outline-variant bg-surface-container-lowest p-3">
        <p data-testid="config-empty" className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">SELECT_AN_ITEM</p>
      </aside>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/studios/${studioId}/items/${item!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          priceAmount: price,
          priceCurrency: currency,
          stock: unlimited ? null : Number(stock),
          saleStartsAt: saleStartsAt || null,
          saleEndsAt: saleEndsAt || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const json = await res.json();
      onSaved(json.item as ItemDto);
    } catch {
      setError("Could not save. Check values and retry.");
    } finally {
      setSaving(false);
    }
  }

  const label = "font-mono text-[10px] uppercase tracking-[0.1em] text-outline";
  const input = "w-full border-b-2 border-outline-variant bg-transparent py-1 font-mono text-on-surface focus:border-primary-fixed focus:outline-none";

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-r-2 border-outline-variant bg-surface-container-lowest p-3">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">ITEM_CONFIG</h2>
      <p className="font-display text-on-surface">{item.name}</p>

      <label className={label}>PRICE
        <input data-testid="config-price" className={input} value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className={label}>CURRENCY
        <select data-testid="config-currency" className={input} value={currency} onChange={(e) => setCurrency(e.target.value as "XLM" | "USDT")}>
          <option value="USDT">USDT</option>
          <option value="XLM">XLM</option>
        </select>
      </label>
      <label className={`${label} flex items-center gap-2`}>
        <input data-testid="config-unlimited" type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
        UNLIMITED_STOCK
      </label>
      {!unlimited && (
        <label className={label}>STOCK
          <input data-testid="config-stock" type="number" className={input} value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
      )}
      <label className={label}>SALE_STARTS
        <input data-testid="config-sale-start" type="datetime-local" className={input} value={saleStartsAt} onChange={(e) => setSaleStartsAt(e.target.value)} />
      </label>
      <label className={label}>SALE_ENDS
        <input data-testid="config-sale-end" type="datetime-local" className={input} value={saleEndsAt} onChange={(e) => setSaleEndsAt(e.target.value)} />
      </label>

      {error && <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-error">{error}</p>}
      <button
        type="button"
        data-testid="config-save"
        disabled={saving}
        onClick={save}
        className="bg-primary-fixed px-3 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-on-primary-fixed active:scale-95 disabled:opacity-50"
      >
        {saving ? "SAVING…" : "SAVE_ITEM"}
      </button>
    </aside>
  );
}
