"use client";

import { useState } from "react";

export function SyncButton({ studioId }: { studioId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/studios/${studioId}/items/sync`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMessage("sync queued — refresh the page in a few seconds");
    } else {
      setMessage(json.error?.message ?? "sync failed");
    }
  }

  return (
    <div className="flex items-center gap-4">
      {message && (
        <span
          className={`font-mono uppercase tracking-[0.1em] text-[12px] ${
            message.includes("queued") ? "text-primary-fixed" : "text-error"
          }`}
        >
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="border-2 border-outline-variant px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] hover:border-primary-fixed disabled:opacity-50"
      >
        {busy ? "SYNCING..." : "SYNC FROM GAME API"}
      </button>
    </div>
  );
}
