import { prisma } from "@xgamefi/db";
import { toAdminUserDto } from "@xgamefi/shared";
import { UsersTable } from "./_components/users-table";

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
      <UsersTable users={rows} />
    </section>
  );
}
