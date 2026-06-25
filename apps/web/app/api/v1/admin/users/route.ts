import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { toAdminUserDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        role: true,
        studioId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return Response.json({ data: rows.map(toAdminUserDto) });
  } catch (e) {
    return handleError(e);
  }
}
