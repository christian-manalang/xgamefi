import { prisma } from "@xgamefi/db";
import { toAdminLedgerEntryDto } from "@xgamefi/shared";
import { LedgerTable } from "./_components/ledger-table";

export default async function AdminTransactions() {
  const rows = await prisma.ledgerEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 51,
  });
  const hasMore = rows.length > 50;
  const page = hasMore ? rows.slice(0, 50) : rows;
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Global Ledger</h1>
      <LedgerTable initial={page.map(toAdminLedgerEntryDto)} initialCursor={hasMore ? (page.at(-1)?.id ?? null) : null} />
    </section>
  );
}
