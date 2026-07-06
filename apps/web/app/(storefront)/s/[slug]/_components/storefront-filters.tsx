"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect, useCallback } from "react";

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function StorefrontFilters({ categories, rarities }: { categories: string[]; rarities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");
  const debouncedQ = useDebouncedValue(q, 250);

  function buildNext(overrides: Record<string, string | "">) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value === "__all__") next.delete(key);
      else if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    return `${pathname}?${next.toString()}`;
  }

  function navigate(overrides: Record<string, string | "">) {
    startTransition(() => router.replace(buildNext(overrides), { scroll: false }));
  }

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (debouncedQ !== current) {
      navigate({ q: debouncedQ });
    }
  }, [debouncedQ]);

  const category = params.get("category") ?? "";
  const rarity = params.get("rarity") ?? "";
  const featured = params.get("featured") === "1";
  const sort = params.get("sort") ?? "";

  const chips: { label: string; remove: () => void }[] = [];
  if (q) chips.push({ label: `SEARCH: ${q}`, remove: () => setQ("") });
  if (category) chips.push({ label: `CATEGORY: ${category.toUpperCase()}`, remove: () => navigate({ category: "" }) });
  if (rarity) chips.push({ label: `RARITY: ${rarity.toUpperCase()}`, remove: () => navigate({ rarity: "" }) });
  if (featured) chips.push({ label: "FEATURED", remove: () => navigate({ featured: "" }) });
  if (sort) chips.push({ label: `SORT: ${sort.toUpperCase().replace("_", " ")}`, remove: () => navigate({ sort: "" }) });

  const inputClass =
    "bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed";

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => e.preventDefault()} role="search">
        <input
          type="search"
          name="q"
          placeholder="SEARCH"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputClass} min-w-[200px]`}
        />

        <select
          name="category"
          value={category}
          onChange={(e) => navigate({ category: e.target.value })}
          className={inputClass}
          aria-label="Category"
        >
          <option value="__all__">ALL CATEGORIES</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>

        <select
          name="rarity"
          value={rarity}
          onChange={(e) => navigate({ rarity: e.target.value })}
          className={inputClass}
          aria-label="Rarity"
        >
          <option value="__all__">ALL RARITIES</option>
          {rarities.map((r) => (
            <option key={r} value={r}>{r.toUpperCase()}</option>
          ))}
        </select>

        <select
          name="sort"
          value={sort}
          onChange={(e) => navigate({ sort: e.target.value })}
          className={inputClass}
          aria-label="Sort"
        >
          <option value="">SORT BY</option>
          <option value="featured">FEATURED</option>
          <option value="price_asc">PRICE LOW → HIGH</option>
          <option value="price_desc">PRICE HIGH → LOW</option>
          <option value="newest">NEWEST</option>
        </select>

        <label className="flex items-center gap-2 font-mono uppercase tracking-[0.05em] text-[12px] text-on-surface-variant cursor-pointer">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => navigate({ featured: e.target.checked ? "1" : "" })}
            className="accent-primary-fixed"
          />
          Featured
        </label>
      </form>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip, i) => (
            <button
              key={i}
              onClick={chip.remove}
              className="flex items-center gap-1 px-2 py-1 border-2 border-outline-variant font-mono text-[10px] uppercase tracking-[0.1em] hover:border-primary-fixed"
            >
              {chip.label}
              <span className="text-on-surface-variant">×</span>
            </button>
          ))}
          <button
            onClick={() => {
              setQ("");
              navigate({ q: "", category: "", rarity: "", featured: "", sort: "" });
            }}
            className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-error hover:underline"
          >
            CLEAR ALL
          </button>
        </div>
      )}
    </div>
  );
}
