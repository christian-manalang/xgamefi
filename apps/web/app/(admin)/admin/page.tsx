import { computePlatformMetrics, toAdminMetricsDto } from "@xgamefi/shared";

export default async function AdminOverview() {
  const dto = toAdminMetricsDto(await computePlatformMetrics());
  const stats = [
    { label: "GMV", value: dto.gmv },
    { label: "FEES COLLECTED", value: dto.feesCollected },
    { label: "ACTIVE STUDIOS", value: String(dto.activeStudios) },
  ];
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Overview</h1>
      <div className="grid grid-cols-3 gap-4 mb-10">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-surface-container p-6 border-2 border-outline-variant"
          >
            <div className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">{s.label}</div>
            <div className="font-display text-3xl text-primary-fixed mt-2">{s.value}</div>
          </div>
        ))}
      </div>
      <h2 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant mb-3">RECENT ORDERS</h2>
      <ul className="divide-y divide-outline-variant">
        {dto.recentOrders.map((o) => (
          <li key={o.id} className="flex justify-between py-3 font-mono text-sm">
            <span>#{o.id.slice(0, 8)} · {o.itemName}</span>
            <span className="text-primary-fixed">{o.grossAmount} {o.currency} · {o.paymentStatus}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
