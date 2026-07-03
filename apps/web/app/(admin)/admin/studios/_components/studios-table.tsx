"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminStudioDto } from "@xgamefi/shared/dto";

function StudioRow({ studio: initial }: { studio: AdminStudioDto }) {
  const [studio, setStudio] = useState(initial);
  const [fee, setFee] = useState(String(studio.platformFeeBps));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function patch(patch: Partial<AdminStudioDto>) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/studios/${studio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.data) {
      setStudio(json.data);
      setFee(String(json.data.platformFeeBps));
      setMessage("saved");
    } else {
      setMessage(json.error?.message ?? "failed");
    }
  }

  return (
    <tr className="border-t border-outline-variant align-top">
      <td className="py-3">
        <Link href={`/admin/studios/${studio.id}`} className="hover:text-primary-fixed">
          {studio.name}
        </Link>
      </td>
      <td className="font-mono py-3">{studio.slug}</td>
      <td className="font-mono py-3">
        <span className={studio.status === "ACTIVE" ? "text-primary-fixed" : "text-error"}>
          {studio.status}
        </span>
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={10000}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="w-20 bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono text-xs px-2 py-1 outline-none focus:border-primary-fixed"
          />
          <button
            onClick={() => patch({ platformFeeBps: Number(fee) })}
            disabled={busy}
            className="border-2 border-outline-variant px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] hover:border-primary-fixed disabled:opacity-50"
          >
            SET
          </button>
        </div>
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          {studio.status !== "ACTIVE" && (
            <button
              onClick={() => patch({ status: "ACTIVE" })}
              disabled={busy}
              className="bg-primary-fixed text-on-primary-fixed px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] disabled:opacity-50"
            >
              APPROVE
            </button>
          )}
          {studio.status !== "SUSPENDED" && (
            <button
              onClick={() => patch({ status: "SUSPENDED" })}
              disabled={busy}
              className="border-2 border-error text-error px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] disabled:opacity-50"
            >
              SUSPEND
            </button>
          )}
          {message && (
            <span
              className={`font-mono text-[10px] ${message === "saved" ? "text-primary-fixed" : "text-error"}`}
            >
              {message}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function StudiosTable({ studios }: { studios: AdminStudioDto[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="font-mono text-xs tracking-[0.1em] text-on-surface-variant text-left">
        <tr>
          <th className="py-2">NAME</th>
          <th>SLUG</th>
          <th>STATUS</th>
          <th>FEE BPS</th>
          <th>ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        {studios.map((s) => (
          <StudioRow key={s.id} studio={s} />
        ))}
      </tbody>
    </table>
  );
}
