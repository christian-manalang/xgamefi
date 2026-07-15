import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { StudioPatchInput, toAdminStudioDto, writeAudit, assertPublicUrl } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    await requireStudio(id);
    const row = await prisma.studio.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "studio not found");
    return Response.json({ data: toAdminStudioDto(row) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const isAdmin = principal.kind === "user" && principal.role === "ADMIN";
    const rawBody = await req.text();
    console.log(`[studio PATCH] id=${id} body=${rawBody}`);
    const patch = StudioPatchInput.parse(JSON.parse(rawBody));

    if ((patch.platformFeeBps !== undefined || patch.status !== undefined) && !isAdmin) {
      throw new HttpError(403, "only an admin may change fee or status");
    }
    const existing = await prisma.studio.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "studio not found");
    if (patch.apiBaseUrl) {
      try {
        await assertPublicUrl(patch.apiBaseUrl);
      } catch (e) {
        throw new HttpError(400, "INVALID_API_BASE_URL");
      }
    }

    const cleaned = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => {
        // For referral reward fields, null means "fall back to env default" — preserve it.
        if (k === "referralRewardAmount" || k === "referralRewardCurrency") return [k, v];
        return [k, v === null ? undefined : v];
      })
    );

    const updated = await prisma.studio.update({ where: { id }, data: cleaned });

    let action = "studio.update";
    if (cleaned.status === "ACTIVE") action = "studio.approve";
    else if (cleaned.status === "SUSPENDED") action = "studio.suspend";
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action,
      entityType: "Studio",
      entityId: id,
      metadata: { changed: Object.keys(patch) },
      ip: getClientIp(req),
    });
    return Response.json({ data: toAdminStudioDto(updated) });
  } catch (e) {
    return handleError(e);
  }
}
