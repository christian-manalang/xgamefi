"use client";

import { useState } from "react";
import type { AdminSettingsDto } from "@xgamefi/shared/dto";

export function AdminSettingsForm({ settings }: { settings: AdminSettingsDto }) {
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultFeeBps: Number(form.defaultFeeBps),
        receivingAccount: form.receivingAccount,
        payoutSignerPublic: form.payoutSignerPublic,
        usdAssetCode: form.usdAssetCode,
        usdAssetIssuer: form.usdAssetIssuer,
        network: form.network,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setStatus("saved");
      if (json.data) setForm(json.data);
    } else {
      setStatus(json.error?.message ?? "save failed");
    }
  }

  const inputClass =
    "w-full bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed";
  const labelClass = "font-mono text-xs tracking-[0.1em] text-on-surface-variant";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className={labelClass}>DEFAULT FEE BPS</label>
          <input
            type="number"
            min={0}
            max={10000}
            value={form.defaultFeeBps}
            onChange={(e) => setForm({ ...form, defaultFeeBps: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>NETWORK</label>
          <select
            value={form.network}
            onChange={(e) => setForm({ ...form, network: e.target.value as "testnet" | "pubnet" })}
            className={inputClass}
          >
            <option value="testnet">TESTNET</option>
            <option value="pubnet">PUBNET</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>RECEIVING ACCOUNT</label>
          <input
            value={form.receivingAccount}
            onChange={(e) => setForm({ ...form, receivingAccount: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>PAYOUT SIGNER PUBLIC</label>
          <input
            value={form.payoutSignerPublic ?? ""}
            onChange={(e) => setForm({ ...form, payoutSignerPublic: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>USD ASSET CODE</label>
          <input
            value={form.usdAssetCode}
            onChange={(e) => setForm({ ...form, usdAssetCode: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>USD ASSET ISSUER</label>
          <input
            value={form.usdAssetIssuer ?? ""}
            onChange={(e) => setForm({ ...form, usdAssetIssuer: e.target.value || null })}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] disabled:opacity-50"
        >
          {loading ? "SAVING..." : "SAVE SETTINGS"}
        </button>
        {status === "saved" && <span className="text-primary-fixed font-mono text-xs">SAVED</span>}
        {status && status !== "saved" && <span className="text-error font-mono text-xs">{status}</span>}
      </div>
    </form>
  );
}
