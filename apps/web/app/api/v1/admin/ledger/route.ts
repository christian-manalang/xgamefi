import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { AdminLedgerQuery, toAdminLedgerEntryDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const url = new URL(req.url);
    const q = AdminLedgerQuery.parse(Object.fromEntries(url.searchParams));
    const rows = await prisma.ledgerEntry.findMany({
      where: {
        ...(q.type ? { type: q.type } : {}),
        ...(q.studioId
          ? {
              OR: [
                { order: { studioId: q.studioId } },
                { trade: { listing: { studioId: q.studioId } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return Response.json({
      data: page.map(toAdminLedgerEntryDto),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
