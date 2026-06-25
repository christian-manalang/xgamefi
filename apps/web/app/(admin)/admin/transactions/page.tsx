import { prisma } from "@xgamefi/db";
import { toAdminLedgerEntryDto } from "@xgamefi/shared";

export default async function AdminTransactions() {
  const rows = (
    await prisma.ledgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  ).map(toAdminLedgerEntryDto);
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Global Ledger</h1>
      <ul className="divide-y divide-outline-variant font-mono text-sm">
        {rows.map((l) => (
          <li key={l.id} className="flex justify-between py-3">
            <span>{l.type} · {l.stellarTxHash.slice(0, 10)}…</span>
            <span className="text-primary-fixed">{l.amount} {l.assetCode}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
