"use client";
import { useState } from "react";

interface PromotionDto {
  id: string;
  name: string;
  type: string;
  value: string;
  currency: string | null;
  isActive: boolean;
  usageCount: number;
}

export function PromotionsManager({ studioId, initial }: { studioId: string; initial: PromotionDto[] }) {
  const [promos, setPromos] = useState<PromotionDto[]>(initial);
  const [name, setName] = useState("");
  const [type, setType] = useState("PERCENT");
  const [value, setValue] = useState("");

  async function create() {
    const res = await fetch(`/api/v1/studios/${studioId}/promotions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type, value }),
    });
    if (res.ok) {
      const { promotion } = await res.json();
      setPromos((p) => [promotion, ...p]);
      setName("");
      setValue("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container border-2 border-outline-variant p-4 grid gap-3 md:grid-cols-4 items-end">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          NAME
          <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-transparent border-b-2 border-outline focus:border-primary-fixed text-on-surface px-1 py-1" />
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
            <span className="font-mono text-xs uppercase text-tertiary-fixed-dim">{p.type}</span>
            <span className="text-primary-fixed font-mono">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
