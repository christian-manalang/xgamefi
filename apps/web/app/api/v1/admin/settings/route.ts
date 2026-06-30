import { requireRole } from "@/lib/auth";
import {
  AdminSettingsInput,
  updatePlatformSettings,
  getPlatformSettings,
  toAdminSettingsDto,
  writeAudit,
} from "@xgamefi/shared";
import { handleError, getClientIp } from "@/lib/http";

export async function GET(): Promise<Response> {
  try {
    await requireRole("ADMIN");
    return Response.json({ data: toAdminSettingsDto(await getPlatformSettings()) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const principal = await requireRole("ADMIN");
    const patch = AdminSettingsInput.parse(await req.json());
    const cleaned = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v])
    ) as Parameters<typeof updatePlatformSettings>[0];
    const updated = await updatePlatformSettings(cleaned);
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "platform.settings.update",
      entityType: "PlatformSetting",
      entityId: updated.id,
      metadata: { changed: Object.keys(patch) },
      ip: getClientIp(req),
    });
    return Response.json({ data: toAdminSettingsDto(updated) });
  } catch (e) {
    return handleError(e);
  }
}
