"use client";

import { useState } from "react";

type TestAccount = {
  role: string;
  username: string;
  password: string;
};

export function TestAccountsNote({ accounts }: { accounts: TestAccount[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 border-2 border-outline-variant bg-surface-container p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant hover:text-on-surface"
      >
        <span>Test accounts</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {accounts.map((a) => (
            <div key={a.role} className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-primary-fixed">{a.role}</p>
              <div className="grid grid-cols-[5rem_1fr] gap-2 font-mono text-xs text-on-surface">
                <span className="text-on-surface-variant">User</span>
                <span>{a.username}</span>
                <span className="text-on-surface-variant">Pass</span>
                <span>{a.password}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
