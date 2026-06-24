"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function StorefrontFilters({ categories, rarities }: { categories: string[]; rarities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const inputClass =
    "bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed";

  return (
    <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => e.preventDefault()} role="search">
      <input
        type="search"
        name="q"
        placeholder="SEARCH"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => update("q", e.target.value)}
        className={`${inputClass} min-w-[200px]`}
      />

      <select
        name="category"
        defaultValue={params.get("category") ?? ""}
        onChange={(e) => update("category", e.target.value)}
        className={inputClass}
        aria-label="Category"
      >
        <option value="">ALL CATEGORIES</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c.toUpperCase()}</option>
        ))}
      </select>

      <select
        name="rarity"
        defaultValue={params.get("rarity") ?? ""}
        onChange={(e) => update("rarity", e.target.value)}
        className={inputClass}
        aria-label="Rarity"
      >
        <option value="">ALL RARITIES</option>
        {rarities.map((r) => (
          <option key={r} value={r}>{r.toUpperCase()}</option>
        ))}
      </select>

      <label className="flex items-center gap-2 font-mono uppercase tracking-[0.05em] text-[12px] text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          defaultChecked={params.get("featured") === "1"}
          onChange={(e) => update("featured", e.target.checked ? "1" : "")}
          className="accent-primary-fixed"
        />
        Featured
      </label>
    </form>
  );
}
