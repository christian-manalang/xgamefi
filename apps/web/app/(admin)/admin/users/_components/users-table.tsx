"use client";

import { useState } from "react";
import type { AdminUserDto } from "@xgamefi/shared/dto";

function UserRow({ user: initial }: { user: AdminUserDto }) {
  const [user, setUser] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function patch(patch: Partial<AdminUserDto>) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.data) {
      setUser(json.data);
      setMessage("saved");
    } else {
      setMessage(json.error?.message ?? "failed");
    }
  }

  return (
    <tr className="border-t border-outline-variant align-top">
      <td className="py-3 font-mono">{user.username}</td>
      <td className="py-3">
        <select
          value={user.role}
          onChange={(e) => patch({ role: e.target.value as AdminUserDto["role"] })}
          disabled={busy}
          className="bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono text-xs px-2 py-1 outline-none focus:border-primary-fixed"
        >
          <option value="ADMIN">ADMIN</option>
          <option value="STUDIO_OWNER">STUDIO_OWNER</option>
          <option value="STUDIO_MEMBER">STUDIO_MEMBER</option>
        </select>
      </td>
      <td className="font-mono py-3">{user.studioId ?? "—"}</td>
      <td className="py-3">
        <button
          onClick={() => patch({ isActive: !user.isActive })}
          disabled={busy}
          className={`px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] border-2 disabled:opacity-50 ${
            user.isActive
              ? "border-primary-fixed text-primary-fixed hover:bg-primary-fixed hover:text-on-primary-fixed"
              : "border-error text-error hover:bg-error hover:text-on-error"
          }`}
        >
          {user.isActive ? "ACTIVE" : "INACTIVE"}
        </button>
        {message && (
          <span
            className={`ml-2 font-mono text-[10px] ${message === "saved" ? "text-primary-fixed" : "text-error"}`}
          >
            {message}
          </span>
        )}
      </td>
    </tr>
  );
}

export function UsersTable({ users }: { users: AdminUserDto[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="font-mono text-xs tracking-[0.1em] text-on-surface-variant text-left">
        <tr>
          <th className="py-2">USERNAME</th>
          <th>ROLE</th>
          <th>STUDIO</th>
          <th>ACTIVE</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </tbody>
    </table>
  );
}
