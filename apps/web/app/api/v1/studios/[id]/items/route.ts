import { prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { requireStudio, scopeToStudio } from "../../../../../../lib/auth/guards";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const rows = await prisma.item.findMany({
    where: { studioId },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ items: rows.map(toItemDto) }, { status: 200 });
}
