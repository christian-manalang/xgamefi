"use client";

import { useState } from "react";
import type { AdminStudioDto } from "@xgamefi/shared/dto";

export function StudioEditForm({ studio: initial }: { studio: AdminStudioDto }) {
  const [studio, setStudio] = useState(initial);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const patch = {
      name: form.name,
      description: form.description,
      payoutWalletAddress: form.payoutWalletAddress,
      integrationMode: form.integrationMode,
      apiBaseUrl: form.apiBaseUrl,
      platformFeeBps: Number(form.platformFeeBps),
      status: form.status,
    };
    const res = await fetch(`/api/v1/studios/${studio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.data) {
      setStudio(json.data);
      setForm(json.data);
      setMessage("saved");
    } else {
      setMessage(json.error?.message ?? "failed");
    }
  }

  const inputClass =
    "w-full bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed";
  const labelClass = "font-mono text-xs tracking-[0.1em] text-on-surface-variant";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className={labelClass}>NAME</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>DESCRIPTION</label>
          <textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={`${inputClass} min-h-[80px]`}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>PAYOUT WALLET ADDRESS</label>
          <input
            value={form.payoutWalletAddress ?? ""}
            onChange={(e) => setForm({ ...form, payoutWalletAddress: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>INTEGRATION MODE</label>
          <select
            value={form.integrationMode}
            onChange={(e) => setForm({ ...form, integrationMode: e.target.value as "API_PULL" | "WEBHOOK_PUSH" })}
            className={inputClass}
          >
            <option value="API_PULL">API_PULL</option>
            <option value="WEBHOOK_PUSH">WEBHOOK_PUSH</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>STATUS</label>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "PENDING" | "ACTIVE" | "SUSPENDED" })}
            className={inputClass}
          >
            <option value="PENDING">PENDING</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>API BASE URL</label>
          <input
            value={form.apiBaseUrl ?? ""}
            onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>PLATFORM FEE BPS</label>
          <input
            type="number"
            min={0}
            max={10000}
            value={form.platformFeeBps}
            onChange={(e) => setForm({ ...form, platformFeeBps: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] disabled:opacity-50"
        >
          {busy ? "SAVING..." : "SAVE STUDIO"}
        </button>
        {message === "saved" && <span className="text-primary-fixed font-mono text-xs">SAVED</span>}
        {message && message !== "saved" && <span className="text-error font-mono text-xs">{message}</span>}
      </div>
    </form>
  );
}
