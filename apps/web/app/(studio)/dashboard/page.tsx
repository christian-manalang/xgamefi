import { redirect } from "next/navigation";
import { prisma } from "@xgamefi/db";
import { computeStudioMetrics, toStudioMetricsDto } from "@xgamefi/shared";
import { requirePrincipal, requireStudio } from "@/lib/auth/guards";

export default async function DashboardOverview() {
  const principal = await requirePrincipal();
  if (principal.kind !== "user" || !principal.studioId) {
    redirect("/login");
  }
  const studioId = principal.studioId;
  await requireStudio(studioId);

  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) redirect("/login");

  const metrics = await computeStudioMetrics(studioId);
  const dto = toStudioMetricsDto(metrics);

  const stats = [
    { label: "GMV", value: dto.gmv },
    { label: "ORDERS", value: String(dto.orderCount) },
    { label: "FEES COLLECTED", value: dto.feesCollected },
  ];

  const { webhookHealth } = dto;
  const healthLabel = webhookHealth.total === 0
    ? "NO WEBHOOKS"
    : `${webhookHealth.successRate}% DELIVERY`;

  return (
    <section className="space-y-10">
      <header>
        <h1 className="font-display text-5xl mb-2">{studio.name}</h1>
        <p className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">
          STUDIO DASHBOARD · {studio.slug}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-container p-6 border-2 border-outline-variant">
            <div className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">{s.label}</div>
            <div className="font-display text-3xl text-primary-fixed mt-2">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-container p-6 border-2 border-outline-variant">
          <div className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">WEBHOOK HEALTH</div>
          <div className="font-display text-3xl text-primary-fixed mt-2">{healthLabel}</div>
          <div className="font-mono text-xs text-on-surface-variant mt-2">
            {webhookHealth.delivered} delivered · {webhookHealth.failed} failed · {webhookHealth.total} total
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant mb-3">RECENT ORDERS</h2>
        {dto.recentOrders.length === 0 ? (
          <p className="text-on-surface-variant">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {dto.recentOrders.map((o) => (
              <li key={o.id} className="flex justify-between py-3 font-mono text-sm">
                <span>#{o.id.slice(0, 8)} · {o.itemName}</span>
                <span className="text-primary-fixed">
                  {o.grossAmount} {o.currency} · {o.paymentStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
