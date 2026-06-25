import { prisma } from "@xgamefi/db";
import { toAdminStudioDto } from "@xgamefi/shared";
import Link from "next/link";

export default async function AdminStudios() {
  const rows = (await prisma.studio.findMany({ orderBy: { createdAt: "desc" } })).map(
    toAdminStudioDto,
  );
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Studios</h1>
      <table className="w-full text-sm">
        <thead className="font-mono text-xs tracking-[0.1em] text-on-surface-variant text-left">
          <tr>
            <th className="py-2">NAME</th>
            <th>SLUG</th>
            <th>STATUS</th>
            <th>FEE BPS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-outline-variant">
              <td className="py-3">
                <Link
                  href={`/admin/studios/${s.id}`}
                  className="hover:text-primary-fixed"
                >
                  {s.name}
                </Link>
              </td>
              <td className="font-mono">{s.slug}</td>
              <td className="font-mono text-primary-fixed">{s.status}</td>
              <td className="font-mono">{s.platformFeeBps}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-mono text-xs text-on-surface-variant mt-4">
        Use approve/suspend and set-fee via PATCH /studios/:id (admin-only fields).
      </p>
    </section>
  );
}
