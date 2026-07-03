import { prisma } from "@xgamefi/db";
import { toAdminStudioDto, toApiKeyDto } from "@xgamefi/shared";
import { notFound } from "next/navigation";
import { StudioEditForm } from "./_components/studio-edit-form";

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
    <section className="space-y-10">
      <div>
        <h1 className="font-display text-4xl mb-6">{studio.name}</h1>
        <StudioEditForm studio={studio} />
      </div>
      <div>
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
      </div>
    </section>
  );
}
