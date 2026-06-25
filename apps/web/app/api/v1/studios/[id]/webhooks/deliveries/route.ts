import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { toWebhookDeliveryDto, AdminLedgerQuery } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    await requireStudio(id);
    const url = new URL(req.url);
    const q = AdminLedgerQuery.pick({ limit: true, cursor: true }).parse(
      Object.fromEntries(url.searchParams),
    );
    const rows = await prisma.webhookDelivery.findMany({
      where: { studioId: id },
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return Response.json({
      data: page.map(toWebhookDeliveryDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
