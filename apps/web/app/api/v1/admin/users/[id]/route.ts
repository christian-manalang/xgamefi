import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { AdminUserUpdateInput, toAdminUserDto, writeAudit } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const principal = await requireRole("ADMIN");
    if (principal.kind !== "user") throw new HttpError(403, "forbidden");
    const { id } = await params;
    const patch = AdminUserUpdateInput.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "user not found");
    if (existing.id === principal.userId && patch.isActive === false) {
      throw new HttpError(400, "cannot deactivate yourself");
    }

    const updated = await prisma.user.update({ where: { id }, data: patch });
    await writeAudit({
      actorType: "USER",
      actorUserId: principal.userId,
      action: "user.update",
      entityType: "User",
      entityId: id,
      metadata: { changed: Object.keys(patch) },
      ip: getClientIp(req),
    });
    return Response.json({ data: toAdminUserDto(updated) });
  } catch (e) {
    return handleError(e);
  }
}
