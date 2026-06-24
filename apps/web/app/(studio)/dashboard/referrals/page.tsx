import { prisma } from "@xgamefi/db";
import { toReferralDto } from "@xgamefi/shared/dto";
import { requireRole } from "@/lib/auth/guards";

export default async function StudioReferralsPage() {
  const principal = await requireRole("STUDIO_OWNER", "STUDIO_MEMBER", "ADMIN");
  if (principal.kind !== "user" || !principal.studioId) throw new Error("studio required");
  const studioId = principal.studioId;

  const referrals = await prisma.referral.findMany({
    where: { studioId, refereePlayerId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  // LedgerEntry has no `referral` relation — scope payouts by the studio's referral ids.
  const payouts = await prisma.ledgerEntry.findMany({
    where: { type: "REFERRAL_REWARD", referralId: { in: referrals.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
  });
  const dtos = referrals.map(toReferralDto);

  return (
    <main className="p-8 space-y-8">
      <h1 className="font-display text-3xl">Referrals</h1>
      <section>
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-outline mb-3">REFERRAL_ACTIVITY</h2>
        <ul className="space-y-2">
          {dtos.map((r) => (
            <li key={r.id} className="bg-surface-container-low border-2 border-outline-variant p-3 flex justify-between">
              <span className="font-mono text-on-surface">{r.code}</span>
              <span className="font-mono text-xs uppercase text-tertiary-fixed-dim">{r.status}</span>
              <span className="text-primary-fixed font-mono">{r.rewardAmount ?? "—"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-outline mb-3">PAYOUTS</h2>
        <ul className="space-y-2">
          {payouts.map((p) => (
            <li key={p.id} className="bg-surface-container-low border-2 border-outline-variant p-3 flex justify-between font-mono text-sm">
              <span className="text-on-surface-variant">{p.destAddress}</span>
              <span className="text-primary-fixed">
                {p.amount.toFixed(7)} {p.assetCode}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
