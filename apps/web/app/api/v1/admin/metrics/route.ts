import { requireRole } from "@/lib/auth";
import { computePlatformMetrics, toAdminMetricsDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const metrics = await computePlatformMetrics();
    return Response.json({ data: toAdminMetricsDto(metrics) });
  } catch (e) {
    return handleError(e);
  }
}
