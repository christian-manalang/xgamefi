"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ label = "LOGOUT" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      router.push("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface hover:border-error hover:text-error transition-colors disabled:opacity-50"
    >
      {busy ? "..." : label}
    </button>
  );
}
