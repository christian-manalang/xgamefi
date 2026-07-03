"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SellableItem } from "@/lib/p2p-queries";

type SellClientProps = {
  slug: string;
  initialItems: SellableItem[];
  isPlayer: boolean;
};

export function SellClient({ slug, initialItems, isPlayer }: SellClientProps) {
  const router = useRouter();
  const [items] = useState<SellableItem[]>(initialItems);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    initialItems[0]?.itemId ?? null,
  );
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"XLM" | "USDT">("USDT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.itemId === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/v1/p2p/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: selectedItem.itemId, price, currency }),
    });

    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "listing failed");
      return;
    }

    router.push(`/s/${slug}/market/listing/${data.listing.id}`);
  }

  if (!isPlayer) {
    return (
      <div className="bg-surface-container-low border-2 border-outline-variant p-8 max-w-md">
        <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-4">
          Wallet Required
        </p>
        <p className="text-on-surface mb-6">Connect your wallet to list items for sale.</p>
        <a
          href={`/s/${slug}`}
          className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.1em] text-[12px] px-6 py-3 bg-primary-fixed text-on-primary-fixed active:scale-95 transition-transform"
        >
          Back to Shop
        </a>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-surface-container-low border-2 border-outline-variant p-8 max-w-md">
        <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-4">
          No Items Available
        </p>
        <p className="text-on-surface mb-6">You don’t own any unlocked items for this studio right now.</p>
        <a
          href={`/s/${slug}/market`}
          className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.1em] text-[12px] px-6 py-3 border-2 border-outline text-on-surface hover:border-primary-fixed hover:text-primary-fixed transition-colors"
        >
          Browse Market
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <h2 className="font-display text-[24px] text-on-surface mb-4">Select an Item</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <button
              key={item.itemId}
              type="button"
              onClick={() => setSelectedItemId(item.itemId)}
              className={`text-left bg-surface-container-low border-2 p-4 transition-all hover:-translate-y-1 ${
                selectedItemId === item.itemId
                  ? "border-primary-fixed shadow-[0_0_15px_var(--primary-glow)]"
                  : "border-outline-variant hover:border-primary-fixed"
              }`}
            >
              <p className="font-display text-[20px] text-on-surface mb-1">{item.name}</p>
              {item.rarity && (
                <span className="inline-block font-mono uppercase tracking-[0.1em] text-[10px] px-2 py-1 bg-surface-container text-on-surface-variant mb-2">
                  {item.rarity}
                </span>
              )}
              <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-primary-fixed">
                Qty: {item.quantity}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-container-low border-2 border-outline-variant p-6">
        <h2 className="font-display text-[24px] text-on-surface mb-6">Listing Details</h2>
        {selectedItem && (
          <div className="mb-6 pb-6 border-b-2 border-outline-variant">
            <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-1">Selected</p>
            <p className="font-display text-[24px] text-on-surface">{selectedItem.name}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="price" className="block font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-2">
              Price
            </label>
            <input
              id="price"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
              pattern="^\d+(\.\d{1,7})?$"
              className="w-full bg-transparent border-b-2 border-outline-variant text-on-surface text-[24px] font-display py-2 focus:outline-none focus:border-primary-fixed"
            />
          </div>

          <div>
            <label htmlFor="currency" className="block font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-2">
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "XLM" | "USDT")}
              className="w-full bg-surface-container-high border-2 border-outline-variant text-on-surface px-4 py-3 focus:outline-none focus:border-primary-fixed"
            >
              <option value="USDT">USDT</option>
              <option value="XLM">XLM</option>
            </select>
          </div>

          {error && (
            <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={!selectedItem || submitting || !price}
            className="w-full px-6 py-4 bg-primary-fixed text-on-primary-fixed font-mono uppercase tracking-[0.1em] text-[12px] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
          >
            {submitting ? "Creating Listing…" : "Create Listing"}
          </button>
        </form>
      </div>
    </div>
  );
}
