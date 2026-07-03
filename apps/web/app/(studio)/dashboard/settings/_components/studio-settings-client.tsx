"use client";

import { useState, useCallback } from "react";
import type { AdminStudioDto, ApiKeyDto, WebhookDeliveryDto, StudioBrandDto } from "@xgamefi/shared";

type StudioForm = AdminStudioDto & {
  brand: StudioBrandDto | null;
};

export function StudioSettingsClient({
  studio: initialStudio,
  apiKeys: initialKeys,
  initialDeliveries,
}: {
  studio: AdminStudioDto;
  apiKeys: ApiKeyDto[];
  initialDeliveries: WebhookDeliveryDto[];
}) {
  const [studio, setStudio] = useState<StudioForm>(initialStudio as StudioForm);
  const [form, setForm] = useState<StudioForm>(initialStudio as StudioForm);
  const [keys, setKeys] = useState(initialKeys);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const inputClass =
    "w-full bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed";
  const labelClass = "font-mono text-xs tracking-[0.1em] text-on-surface-variant";
  const buttonPrimaryClass =
    "bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] disabled:opacity-50 active:scale-95";
  const buttonSecondaryClass =
    "border-2 border-outline-variant px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] hover:border-primary-fixed disabled:opacity-50 active:scale-95";

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 2000);
    } catch {
      setMessage("copy failed");
    }
  }, []);

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setWebhookSecret(null);

    const profilePatch = {
      name: form.name,
      description: form.description,
      logoUrl: form.logoUrl,
      brand: form.brand,
      payoutWalletAddress: form.payoutWalletAddress,
      integrationMode: form.integrationMode,
      apiBaseUrl: form.apiBaseUrl,
    };

    const webhookPatch = { url: form.webhookUrl };

    let profileOk = false;
    let webhookOk = false;

    const profileRes = await fetch(`/api/v1/studios/${studio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profilePatch),
    });
    const profileJson = await profileRes.json().catch(() => ({}));
    if (profileRes.ok && profileJson.data) {
      setStudio(profileJson.data);
      setForm(profileJson.data);
      profileOk = true;
    }

    const webhookRes = await fetch(`/api/v1/studios/${studio.id}/webhook`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPatch),
    });
    const webhookJson = await webhookRes.json().catch(() => ({}));
    if (webhookRes.ok && webhookJson.data) {
      setWebhookSecret(webhookJson.data.secret);
      setForm((prev) => ({ ...prev, webhookUrl: webhookJson.data.webhookUrl }));
      webhookOk = true;
    }

    setBusy(false);
    if (profileOk && webhookOk) {
      setMessage("saved");
    } else if (profileOk) {
      setMessage("profile saved — webhook failed: " + (webhookJson.error?.message ?? "unknown"));
    } else if (webhookOk) {
      setMessage("webhook saved — profile failed: " + (profileJson.error?.message ?? "unknown"));
    } else {
      setMessage(profileJson.error?.message ?? webhookJson.error?.message ?? "failed");
    }
  }

  async function testWebhook() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/studios/${studio.id}/webhooks/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "purchase.completed" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMessage("test webhook queued");
      if (json.data) setDeliveries((prev) => [json.data, ...prev]);
    } else {
      setMessage(json.error?.message ?? "test failed");
    }
  }

  async function issueKey() {
    setBusy(true);
    setMessage(null);
    setNewKey(null);
    const res = await fetch(`/api/v1/studios/${studio.id}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["ingest"] }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.data) {
      setNewKey(json.data.key);
      setKeys((prev) => [json.data, ...prev]);
      setMessage("API key issued — copy it now, it will not be shown again");
    } else {
      setMessage(json.error?.message ?? "failed");
    }
  }

  async function revokeKey(keyId: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/studios/${studio.id}/api-keys/${keyId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.data) {
      setKeys((prev) => prev.map((k) => (k.id === keyId ? json.data : k)));
      setMessage("API key revoked");
    } else {
      setMessage(json.error?.message ?? "failed");
    }
  }

  async function retryDelivery(deliveryId: string) {
    const res = await fetch(`/api/v1/studios/${studio.id}/webhooks/deliveries/${deliveryId}/retry`, {
      method: "POST",
    });
    if (res.ok) setMessage("delivery retry queued");
  }

  function updateBrand(patch: Partial<StudioBrandDto>) {
    setForm((prev) => ({ ...prev, brand: { ...(prev.brand ?? {}), ...patch } }));
  }

  const brand = form.brand ?? {};

  return (
    <section className="space-y-12">
      <header>
        <h1 className="font-display text-5xl mb-2">Studio Settings</h1>
        <p className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">{studio.slug}</p>
      </header>

      {message && (
        <div
          className={`font-mono text-xs p-3 border-2 ${
            message.includes("saved") || message.includes("queued") || message.includes("issued")
              ? "border-primary-fixed text-primary-fixed"
              : "border-error text-error"
          }`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <form onSubmit={saveAll} className="space-y-10 max-w-2xl">
        <div className="space-y-6">
          <h2 className={labelClass}>PROFILE</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className={labelClass}>NAME</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
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
                placeholder="G... (Stellar public key)"
                className={inputClass}
              />
              <p className="font-mono text-[10px] tracking-[0.05em] text-on-surface-variant mt-1">
                Stellar address where xGameFi sends automatic payouts. Must start with G and be 56 characters.
              </p>
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
              <p className="font-mono text-[10px] tracking-[0.05em] text-on-surface-variant mt-1">
                API_PULL = xGameFi fetches items from your game API. WEBHOOK_PUSH = you push items to xGameFi.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>API BASE URL</label>
              <input
                value={form.apiBaseUrl ?? ""}
                onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value || null })}
                placeholder="http://localhost:3000/api/mock-game"
                className={inputClass}
              />
              <p className="font-mono text-[10px] tracking-[0.05em] text-on-surface-variant mt-1">
                Used in API_PULL mode. xGameFi calls GET {"{apiBaseUrl}/items"}.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className={labelClass}>BRANDING</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className={labelClass}>LOGO URL</label>
              <input
                value={form.logoUrl ?? ""}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value || null })}
                placeholder="https://cdn.example.com/logo.png"
                className={inputClass}
              />
              {form.logoUrl && (
                <div className="mt-3 border-2 border-outline-variant p-2 inline-block">
                  <img src={form.logoUrl} alt="Studio logo preview" className="h-16 w-auto object-contain" />
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>PRIMARY COLOR</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brand.primary ?? "#c3f400"}
                  onChange={(e) => updateBrand({ primary: e.target.value })}
                  className="h-10 w-10 bg-transparent border-2 border-outline-variant cursor-pointer"
                  aria-label="Primary brand color"
                />
                <input
                  value={brand.primary ?? ""}
                  onChange={(e) => updateBrand({ primary: e.target.value })}
                  placeholder="#c3f400"
                  className={`${inputClass} flex-1`}
                />
              </div>
              <p className="font-mono text-[10px] tracking-[0.05em] text-on-surface-variant mt-1">
                Hero accent used for CTAs and focus states.
              </p>
            </div>
            <div>
              <label className={labelClass}>ACCENT COLOR</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brand.accent ?? "#ffabf3"}
                  onChange={(e) => updateBrand({ accent: e.target.value })}
                  className="h-10 w-10 bg-transparent border-2 border-outline-variant cursor-pointer"
                  aria-label="Accent brand color"
                />
                <input
                  value={brand.accent ?? ""}
                  onChange={(e) => updateBrand({ accent: e.target.value })}
                  placeholder="#ffabf3"
                  className={`${inputClass} flex-1`}
                />
              </div>
              <p className="font-mono text-[10px] tracking-[0.05em] text-on-surface-variant mt-1">
                Secondary accent used for hover and highlights.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className={labelClass}>WEBHOOK</h2>
          <div className="md:col-span-2">
            <label className={labelClass}>WEBHOOK URL</label>
            <input
              value={form.webhookUrl ?? ""}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value || null })}
              placeholder="http://localhost:3000/api/mock-game/webhook"
              className={inputClass}
            />
            <p className="font-mono text-[10px] tracking-[0.05em] text-on-surface-variant mt-1">
              xGameFi POSTs purchase events here (e.g. purchase.completed). Saving rotates the signing secret.
            </p>
          </div>
          {webhookSecret && (
            <div className="bg-surface-container-low border-2 border-primary-fixed p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">
                NEW WEBHOOK SECRET — COPY NOW
              </p>
              <code className="block font-mono text-xs break-all text-on-surface">{webhookSecret}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(webhookSecret, "secret")}
                className="text-[10px] uppercase tracking-[0.1em] font-mono border-2 border-outline-variant px-2 py-1 hover:border-primary-fixed"
              >
                {copied === "secret" ? "COPIED" : "COPY"}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={buttonPrimaryClass}>
            {busy ? "SAVING..." : "SAVE SETTINGS"}
          </button>
          <button type="button" onClick={testWebhook} disabled={busy} className={buttonSecondaryClass}>
            TEST WEBHOOK
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className={labelClass}>API KEYS</h2>
        {newKey && (
          <div className="bg-surface-container-low border-2 border-primary-fixed p-3 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">
              NEW API KEY — COPY NOW. IT WILL NOT BE SHOWN AGAIN.
            </p>
            <code className="block font-mono text-xs break-all text-on-surface">{newKey}</code>
            <button
              type="button"
              onClick={() => copyToClipboard(newKey, "apikey")}
              className="text-[10px] uppercase tracking-[0.1em] font-mono border-2 border-outline-variant px-2 py-1 hover:border-primary-fixed"
            >
              {copied === "apikey" ? "COPIED" : "COPY"}
            </button>
          </div>
        )}
        <button
          onClick={issueKey}
          disabled={busy}
          className={buttonSecondaryClass}
        >
          ISSUE API KEY
        </button>
        <ul className="divide-y divide-outline-variant font-mono text-sm">
          {keys.map((k) => (
            <li key={k.id} className="py-2 flex items-center justify-between">
              <span>
                {k.keyPrefix}… · {k.scopes.join(",")} ·{" "}
                <span className={k.revokedAt ? "text-error" : "text-primary-fixed"}>
                  {k.revokedAt ? "REVOKED" : "ACTIVE"}
                </span>
              </span>
              {!k.revokedAt && (
                <button
                  onClick={() => revokeKey(k.id)}
                  disabled={busy}
                  className="text-error font-mono text-[10px] uppercase tracking-[0.1em] border-2 border-error px-2 py-1 disabled:opacity-50"
                >
                  REVOKE
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className={labelClass}>RECENT WEBHOOK DELIVERIES</h2>
        <ul className="divide-y divide-outline-variant font-mono text-sm">
          {deliveries.map((d) => (
            <li key={d.id} className="py-3 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              <span>{d.event}</span>
              <span className="text-on-surface-variant">{d.status}</span>
              <span className="text-on-surface-variant">{d.responseStatus ?? "—"}</span>
              <span className="text-on-surface-variant">{new Date(d.createdAt).toLocaleString()}</span>
              <span className="md:text-right">
                {d.status !== "DELIVERED" && (
                  <button
                    onClick={() => retryDelivery(d.id)}
                    className="border-2 border-outline-variant px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] hover:border-primary-fixed"
                  >
                    RETRY
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
