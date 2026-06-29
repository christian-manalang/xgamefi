import { redirect } from "next/navigation";
import { prisma } from "@xgamefi/db";
import { requirePrincipal } from "@/lib/auth";

export default async function DashboardOverview() {
  const principal = await requirePrincipal();
  if (principal.kind !== "user" || !principal.studioId) {
    redirect("/login");
  }
  const studioId = principal.studioId;

  const [studio, recentOrders, itemCount, activePromotions] = await Promise.all([
    prisma.studio.findUnique({ where: { id: studioId } }),
    prisma.order.findMany({
      where: { studioId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { item: { select: { name: true } } },
    }),
    prisma.item.count({ where: { studioId } }),
    prisma.promotion.count({ where: { studioId, isActive: true } }),
  ]);

  if (!studio) redirect("/login");

  const revenue = await prisma.order.aggregate({
    where: { studioId, paymentStatus: "PAID" },
    _sum: { grossAmount: true },
  });

  const stats = [
    { label: "TOTAL REVENUE", value: `${revenue._sum.grossAmount?.toString() ?? "0"} USDT` },
    { label: "ACTIVE ITEMS", value: String(itemCount) },
    { label: "ACTIVE PROMOTIONS", value: String(activePromotions) },
  ];

  return (
    <section className="space-y-10">
      <header>
        <h1 className="font-display text-5xl mb-2">{studio.name}</h1>
        <p className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">STUDIO DASHBOARD · {studio.slug}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-container p-6 border-2 border-outline-variant">
            <div className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">{s.label}</div>
            <div className="font-display text-3xl text-primary-fixed mt-2">{s.value}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant mb-3">RECENT ORDERS</h2>
        {recentOrders.length === 0 ? (
          <p className="text-on-surface-variant">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex justify-between py-3 font-mono text-sm">
                <span>#{o.id.slice(0, 8)} · {o.item.name}</span>
                <span className="text-primary-fixed">
                  {o.grossAmount.toString()} {o.currency} · {o.paymentStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
