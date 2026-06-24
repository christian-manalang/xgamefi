import { getQueue } from "@xgamefi/shared/queues";
import { requireStudio, scopeToStudio } from "../../../../../../../lib/auth/guards";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const data = { studioId };
  await getQueue("catalogue-sync").add("catalogue-sync", data);
  return Response.json({ enqueued: true }, { status: 202 });
}
