import { prisma } from "@xgamefi/db";
import { toAdminStudioDto } from "@xgamefi/shared";
import { StudiosTable } from "./_components/studios-table";

export default async function AdminStudios() {
  const rows = (await prisma.studio.findMany({ orderBy: { createdAt: "desc" } })).map(
    toAdminStudioDto,
  );
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Studios</h1>
      <StudiosTable studios={rows} />
    </section>
  );
}
