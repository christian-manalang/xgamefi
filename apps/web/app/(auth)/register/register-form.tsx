"use client";

import { useState, type FormEvent } from "react";

export function RegisterForm() {
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    studioName: "",
    slug: "",
    payoutWalletAddress: "",
    integrationMode: "API_PULL",
    apiBaseUrl: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const body = {
      ...form,
      payoutWalletAddress: form.payoutWalletAddress || undefined,
      apiBaseUrl: form.apiBaseUrl || undefined,
    };

    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error?.code ? formatCode(json.error.code) : "Registration failed. Please check your inputs.");
      return;
    }

    window.location.href = "/dashboard";
  }

  const label = "flex flex-col gap-1";
  const labelText = "font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant";
  const input = "bg-transparent border-b-2 border-outline-variant focus:border-primary-fixed focus:outline-none py-2 text-on-surface font-mono";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className={label}>
        <span className={labelText}>Username</span>
        <input
          name="username" autoComplete="username" required value={form.username}
          onChange={(e) => updateField("username", e.target.value)}
          className={input}
        />
      </label>

      <label className={label}>
        <span className={labelText}>Password</span>
        <input
          name="password" type="password" autoComplete="new-password" required minLength={8}
          value={form.password}
          onChange={(e) => updateField("password", e.target.value)}
          className={input}
        />
      </label>

      <label className={label}>
        <span className={labelText}>Confirm password</span>
        <input
          name="confirmPassword" type="password" autoComplete="new-password" required
          value={form.confirmPassword}
          onChange={(e) => updateField("confirmPassword", e.target.value)}
          className={input}
        />
      </label>

      <label className={label}>
        <span className={labelText}>Studio name</span>
        <input
          name="studioName" required value={form.studioName}
          onChange={(e) => updateField("studioName", e.target.value)}
          className={input}
        />
      </label>

      <label className={label}>
        <span className={labelText}>Shop slug (lowercase, hyphens)</span>
        <input
          name="slug" required pattern="^[a-z0-9-]+$" value={form.slug}
          onChange={(e) => updateField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          className={input}
        />
      </label>

      <label className={label}>
        <span className={labelText}>Payout wallet (optional)</span>
        <input
          name="payoutWalletAddress" placeholder="G..." value={form.payoutWalletAddress}
          onChange={(e) => updateField("payoutWalletAddress", e.target.value)}
          className={input}
        />
      </label>

      <label className={label}>
        <span className={labelText}>Integration mode</span>
        <select
          name="integrationMode" value={form.integrationMode}
          onChange={(e) => updateField("integrationMode", e.target.value)}
          className={input}
        >
          <option value="API_PULL">Pull from game API</option>
          <option value="WEBHOOK_PUSH">Push from game API</option>
        </select>
      </label>

      <label className={label}>
        <span className={labelText}>Game API base URL (optional)</span>
        <input
          name="apiBaseUrl" type="url" placeholder="https://..." value={form.apiBaseUrl}
          onChange={(e) => updateField("apiBaseUrl", e.target.value)}
          className={input}
        />
      </label>

      {error && <p role="alert" className="text-error font-mono text-xs uppercase tracking-[0.1em]">{error}</p>}

      <button
        type="submit" disabled={pending}
        className="bg-primary-fixed text-on-primary-fixed font-mono text-xs uppercase tracking-[0.1em] py-3 active:scale-95 disabled:opacity-50 mt-2"
      >
        {pending ? "Creating studio…" : "Create studio"}
      </button>
    </form>
  );
}

function formatCode(code: string): string {
  const map: Record<string, string> = {
    USERNAME_TAKEN: "Username is already taken.",
    SLUG_TAKEN: "Shop slug is already taken.",
    INVALID_INPUT: "Please check all fields.",
    INVALID_API_BASE_URL: "Game API URL must be a public HTTPS address.",
    RATE_LIMITED: "Too many attempts. Try again later.",
  };
  return map[code] ?? code;
}
