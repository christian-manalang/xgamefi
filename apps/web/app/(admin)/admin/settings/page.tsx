import { getPlatformSettings, toAdminSettingsDto } from "@xgamefi/shared";

export default async function AdminSettings() {
  const s = toAdminSettingsDto(await getPlatformSettings());
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Platform Settings</h1>
      <dl className="grid grid-cols-2 gap-3 font-mono text-sm max-w-2xl">
        <dt className="text-on-surface-variant">DEFAULT FEE BPS</dt>
        <dd className="text-primary-fixed">{s.defaultFeeBps}</dd>
        <dt className="text-on-surface-variant">NETWORK</dt>
        <dd>{s.network}</dd>
        <dt className="text-on-surface-variant">RECEIVING ACCOUNT</dt>
        <dd>{s.receivingAccount}</dd>
        <dt className="text-on-surface-variant">USD ASSET</dt>
        <dd>{s.usdAssetCode} {s.usdAssetIssuer ? `· ${s.usdAssetIssuer.slice(0, 8)}…` : ""}</dd>
      </dl>
      <p className="font-mono text-xs text-on-surface-variant mt-6">
        Edit via PATCH /api/v1/admin/settings (changes are audit-logged).
      </p>
    </section>
  );
}
