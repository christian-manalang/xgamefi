"use client";
import { useState } from "react";

interface PromotionDto {
  id: string;
  name: string;
  code: string | null;
  type: string;
  value: string;
  currency: string | null;
  isActive: boolean;
  usageCount: number;
}

export function PromotionsManager({ studioId, initial }: { studioId: string; initial: PromotionDto[] }) {
  const [promos, setPromos] = useState<PromotionDto[]>(initial);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("PERCENT");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const res = await fetch(`/api/v1/studios/${studioId}/promotions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, code: code.trim() || null, type, value }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const { promotion } = json;
      setPromos((p) => [promotion, ...p]);
      setName("");
      setCode("");
      setValue("");
    } else {
      setError(json.error?.message ?? json.error?.code ?? "create failed");
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="font-mono text-xs p-3 border-2 border-error text-error" role="alert">
          {error}
        </div>
      )}
      <div className="bg-surface-container border-2 border-outline-variant p-4 grid gap-3 md:grid-cols-5 items-end">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          NAME
          <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-transparent border-b-2 border-outline focus:border-primary-fixed text-on-surface px-1 py-1" />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          CODE (optional)
          <input aria-label="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto-apply if blank" className="bg-transparent border-b-2 border-outline focus:border-primary-fixed text-on-surface px-1 py-1 placeholder:text-outline" />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          TYPE
          <select aria-label="type" value={type} onChange={(e) => setType(e.target.value)} className="bg-surface-container-high text-on-surface px-1 py-1">
            <option value="PERCENT">PERCENT</option>
            <option value="FIXED">FIXED</option>
            <option value="BUNDLE">BUNDLE</option>
            <option value="FIRST_PURCHASE">FIRST_PURCHASE</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          VALUE
          <input aria-label="value" value={value} onChange={(e) => setValue(e.target.value)} className="bg-transparent border-b-2 border-outline focus:border-primary-fixed text-on-surface px-1 py-1" />
        </label>
        <button onClick={create} className="bg-primary-fixed text-on-primary-fixed font-mono uppercase tracking-[0.1em] px-4 py-2 active:scale-95">
          CREATE PROMOTION
        </button>
      </div>
      <ul className="space-y-2">
        {promos.map((p) => (
          <li key={p.id} className="bg-surface-container-low border-2 border-outline-variant p-3 flex justify-between">
            <span className="text-on-surface">{p.name}</span>
            {p.code ? (
              <span className="font-mono text-xs uppercase text-primary-fixed border-2 border-primary-fixed px-2 py-0.5">
                {p.code}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase text-outline">auto</span>
            )}
            <span className="font-mono text-xs uppercase text-tertiary-fixed-dim">{p.type}</span>
            <span className="text-primary-fixed font-mono">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
