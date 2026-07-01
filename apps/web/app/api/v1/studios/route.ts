import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import {
  StudioOnboardInput,
  toAdminStudioDto,
  getPlatformSettings,
  writeAudit,
  assertPublicUrl,
} from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const rows = await prisma.studio.findMany({ orderBy: { createdAt: "desc" } });
    return Response.json({ data: rows.map(toAdminStudioDto) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const principal = await requireRole("ADMIN");
    const input = StudioOnboardInput.parse(await req.json());
    if (input.apiBaseUrl) {
      try {
        await assertPublicUrl(input.apiBaseUrl);
      } catch {
        throw new HttpError(400, "INVALID_API_BASE_URL");
      }
    }
    const settings = await getPlatformSettings();
    const created = await prisma.studio.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        payoutWalletAddress: input.payoutWalletAddress,
        integrationMode: input.integrationMode,
        apiBaseUrl: input.apiBaseUrl,
        platformFeeBps: settings.defaultFeeBps,
        status: "PENDING",
      },
    });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "studio.onboard",
      entityType: "Studio",
      entityId: created.id,
      metadata: { slug: created.slug },
      ip: getClientIp(req),
    });
    return Response.json({ data: toAdminStudioDto(created) }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
