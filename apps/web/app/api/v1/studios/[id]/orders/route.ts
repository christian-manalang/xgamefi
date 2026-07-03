import { requireStudio, scopeToStudio } from "@/lib/auth/guards";
import { listStudioOrders } from "@/lib/order-queries";
import { handleError } from "@/lib/http";
import { StudioOrdersQuery } from "@xgamefi/shared/zod/order";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id: studioId } = await params;
    const principal = await requireStudio(studioId);
    scopeToStudio(principal, studioId);

    const url = new URL(req.url);
    const q = StudioOrdersQuery.parse(Object.fromEntries(url.searchParams));

    const result = await listStudioOrders({
      studioId,
      paymentStatus: q.paymentStatus,
      deliveryStatus: q.deliveryStatus,
      cursor: q.cursor,
      limit: q.limit,
    });

    return Response.json(result);
  } catch (e) {
    return handleError(e);
  }
}
