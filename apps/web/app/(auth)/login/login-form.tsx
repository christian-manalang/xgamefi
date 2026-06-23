"use client";
import { useState } from "react";
import type { FormEvent } from "react";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Incorrect username or password.");
      return;
    }
    const { data } = await res.json();
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next ?? (data.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant">Username</span>
        <input
          name="username" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="bg-transparent border-b-2 border-outline-variant focus:border-primary-fixed focus:outline-none py-2 text-on-surface font-mono"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant">Password</span>
        <input
          name="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-transparent border-b-2 border-outline-variant focus:border-primary-fixed focus:outline-none py-2 text-on-surface font-mono"
        />
      </label>
      {error && <p role="alert" className="text-error font-mono text-xs uppercase tracking-[0.1em]">{error}</p>}
      <button
        type="submit" disabled={pending}
        className="bg-primary-fixed text-on-primary-fixed font-mono text-xs uppercase tracking-[0.1em] py-3 active:scale-95 disabled:opacity-50"
      >
        {pending ? "Authenticating…" : "Sign in"}
      </button>
    </form>
  );
}
