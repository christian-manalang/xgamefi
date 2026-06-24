import { prisma } from "@xgamefi/db";
import { toPromotionDto } from "@xgamefi/shared/dto";
import { requireRole } from "@/lib/auth/guards";
import { PromotionsManager } from "./PromotionsManager";

export default async function PromotionsPage() {
  const principal = await requireRole("STUDIO_OWNER", "STUDIO_MEMBER", "ADMIN");
  if (principal.kind !== "user" || !principal.studioId) throw new Error("studio required");
  const studioId = principal.studioId;

  const rows = await prisma.promotion.findMany({ where: { studioId }, orderBy: { createdAt: "desc" } });
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl mb-6">Promotions</h1>
      <PromotionsManager studioId={studioId} initial={rows.map(toPromotionDto)} />
    </main>
  );
}
