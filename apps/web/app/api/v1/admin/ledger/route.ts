import { requireRole } from "@/lib/auth";
import { prisma, Prisma, LedgerEntryType } from "@xgamefi/db";
import { AdminLedgerQuery, toAdminLedgerEntryDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const url = new URL(req.url);
    const q = AdminLedgerQuery.parse(Object.fromEntries(url.searchParams));

    const where: Prisma.LedgerEntryWhereInput = {
      ...(q.type ? { type: q.type as LedgerEntryType } : {}),
    };

    if (q.studioId) {
      const [orders, trades] = await Promise.all([
        prisma.order.findMany({
          where: { studioId: q.studioId },
          select: { id: true },
        }),
        prisma.p2PTrade.findMany({
          where: { listing: { studioId: q.studioId } },
          select: { id: true },
        }),
      ]);
      const orderIds = orders.map((o) => o.id);
      const tradeIds = trades.map((t) => t.id);
      const clauses: Prisma.LedgerEntryWhereInput[] = [];
      if (orderIds.length) clauses.push({ orderId: { in: orderIds } });
      if (tradeIds.length) clauses.push({ tradeId: { in: tradeIds } });
      if (clauses.length) where.OR = clauses;
      else return Response.json({ data: [], nextCursor: null });
    }

    const rows = await prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return Response.json({
      data: page.map(toAdminLedgerEntryDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
