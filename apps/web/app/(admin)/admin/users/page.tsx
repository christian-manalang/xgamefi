import { prisma } from "@xgamefi/db";
import { toAdminUserDto } from "@xgamefi/shared";

export default async function AdminUsers() {
  const rows = (
    await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        role: true,
        studioId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })
  ).map(toAdminUserDto);
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Users</h1>
      <table className="w-full text-sm">
        <thead className="font-mono text-xs tracking-[0.1em] text-on-surface-variant text-left">
          <tr>
            <th className="py-2">USERNAME</th>
            <th>ROLE</th>
            <th>STUDIO</th>
            <th>ACTIVE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-outline-variant">
              <td className="py-3 font-mono">{u.username}</td>
              <td className="font-mono text-primary-fixed">{u.role}</td>
              <td className="font-mono">{u.studioId ?? "—"}</td>
              <td className="font-mono">{u.isActive ? "YES" : "NO"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
