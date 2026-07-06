"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminLedgerEntryDto } from "@xgamefi/shared/dto";

const LEDGER_TYPES = ["SALE_IN", "PAYOUT_OUT", "P2P_ESCROW_IN", "P2P_PAYOUT", "REFERRAL_REWARD", "REFUND"];

export function LedgerTable({
  initial,
  initialCursor,
}: {
  initial: AdminLedgerEntryDto[];
  initialCursor: string | null;
}) {
  const [entries, setEntries] = useState(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(nextCursor?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (nextCursor) params.set("cursor", nextCursor);
    params.set("limit", "50");
    const res = await fetch(`/api/v1/admin/ledger?${params.toString()}`);
    const json = await res.json().catch(() => ({ data: [], nextCursor: null }));
    setLoading(false);
    if (res.ok) {
      if (nextCursor) {
        setEntries((prev) => [...prev, ...json.data]);
      } else {
        setEntries(json.data);
      }
      setCursor(json.nextCursor);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            load();
          }}
          className="bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed"
        >
          <option value="">ALL TYPES</option>
          {LEDGER_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <ul className="divide-y divide-outline-variant font-mono text-sm">
        {entries.map((l) => (
          <li key={l.id} className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <span>{l.type}</span>
            <span className="text-on-surface-variant truncate">
              {l.stellarTxHash.slice(0, 12)}…
            </span>
            <span className="text-on-surface-variant">
              {new Date(l.createdAt).toLocaleString()}
            </span>
            <span className="text-primary-fixed md:text-right">
              {l.amount} {l.assetCode}
            </span>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          onClick={() => load(cursor)}
          disabled={loading}
          className="mt-4 border-2 border-outline-variant px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] hover:border-primary-fixed disabled:opacity-50"
        >
          {loading ? "LOADING..." : "LOAD MORE"}
        </button>
      )}
    </div>
  );
}
