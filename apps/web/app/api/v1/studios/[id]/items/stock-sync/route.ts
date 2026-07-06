import { getQueue } from "@xgamefi/shared/queues";
import { requireStudio, scopeToStudio } from "@/lib/auth/guards";
import { jsonOk, jsonError, errorToResponse } from "@/lib/http";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: studioId } = await ctx.params;
    const principal = await requireStudio(studioId);
    scopeToStudio(principal, studioId);

    await getQueue("stock-sync").add(`stock-sync:${studioId}`, { studioId });
    return jsonOk({ queued: true });
  } catch (e) {
    return errorToResponse(e);
  }
}
