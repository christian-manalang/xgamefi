import { prisma } from "@xgamefi/db";
import { toAdminStudioDto, toApiKeyDto } from "@xgamefi/shared";
import { notFound } from "next/navigation";

export default async function AdminStudioDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await prisma.studio.findUnique({
    where: { id },
    include: { apiKeys: true },
  });
  if (!row) notFound();
  const studio = toAdminStudioDto(row);
  const keys = row.apiKeys.map(toApiKeyDto);
  return (
    <section>
      <h1 className="font-display text-4xl mb-6">{studio.name}</h1>
      <dl className="grid grid-cols-2 gap-3 font-mono text-sm mb-8">
        <dt className="text-on-surface-variant">PAYOUT WALLET</dt>
        <dd>{studio.payoutWalletAddress ?? "—"}</dd>
        <dt className="text-on-surface-variant">WEBHOOK URL</dt>
        <dd>{studio.webhookUrl ?? "—"}</dd>
        <dt className="text-on-surface-variant">INTEGRATION</dt>
        <dd>{studio.integrationMode}</dd>
        <dt className="text-on-surface-variant">FEE BPS</dt>
        <dd className="text-primary-fixed">{studio.platformFeeBps}</dd>
      </dl>
      <h2 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant mb-3">API KEYS</h2>
      <ul className="divide-y divide-outline-variant font-mono text-sm">
        {keys.map((k) => (
          <li key={k.id} className="py-2 flex justify-between">
            <span>{k.keyPrefix}…</span>
            <span className={k.revokedAt ? "text-error" : "text-primary-fixed"}>
              {k.revokedAt ? "REVOKED" : "ACTIVE"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
