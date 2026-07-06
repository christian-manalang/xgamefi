import { prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const row = await prisma.item.findFirst({ where: { id, isActive: true, isListed: true } });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ item: toItemDto(row) }, { status: 200 });
}
