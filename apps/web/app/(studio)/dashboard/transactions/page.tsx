import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { listStudioOrders } from "@/lib/order-queries";
import { env } from "@xgamefi/config/env";
import { TransactionsTable } from "./_components/transactions-table";

export default async function StudioTransactionsPage() {
  const principal = await requirePrincipal();
  if (principal.kind !== "user" || !principal.studioId) {
    redirect("/login");
  }
  const studioId = principal.studioId;

  const initial = await listStudioOrders({ studioId, limit: 50 });
  const explorerBaseUrl = `https://stellar.expert/explorer/${env.STELLAR_NETWORK}/tx`;

  return (
    <section className="flex flex-col gap-4 p-8">
      <div>
        <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">
          Transactions
        </h1>
        <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          STUDIO ORDER HISTORY
        </p>
      </div>
      <TransactionsTable
        studioId={studioId}
        explorerBaseUrl={explorerBaseUrl}
        initial={initial.data}
        initialCursor={initial.nextCursor}
      />
    </section>
  );
}
