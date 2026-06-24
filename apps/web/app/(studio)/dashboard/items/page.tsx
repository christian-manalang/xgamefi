import { prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { requireStudio, requirePrincipal } from "../../../../lib/auth/guards";
import { ItemRow } from "../_components/item-row";

export default async function Page() {
  const principal = await requirePrincipal();
  const studioId = principal.kind === "user" ? principal.studioId : undefined;
  if (!studioId) {
    return <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-error">NO STUDIO CONTEXT</p>;
  }
  await requireStudio(studioId);

  const rows = await prisma.item.findMany({ where: { studioId }, orderBy: { createdAt: "asc" } });
  const items = rows.map(toItemDto);

  return (
    <section className="flex flex-col gap-4 p-8">
      <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">Items</h1>
      <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
        SYNCED FROM GAME API · {items.length} TOTAL
      </p>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
