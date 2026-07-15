import { prisma, Prisma } from "@xgamefi/db";
import { toPromotionDto } from "@xgamefi/shared/dto";
import { UpdatePromotionInput } from "@xgamefi/shared/zod/promotion";
import { requireStudio, scopeToStudio } from "../../../../../../../lib/auth/guards";
import { rateLimit } from "../../../../../../../lib/auth/ratelimit";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; promoId: string }> },
): Promise<Response> {
  const { id: studioId, promoId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const rl = await rateLimit({ scope: "promotions:update", identifier: principal.kind === "user" ? principal.userId : principal.playerId, limit: 30, windowSec: 60 });
  if (!rl.allowed) return Response.json({ error: "rate limited" }, { status: 429 });

  const parsed = UpdatePromotionInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid input", issues: parsed.error.issues }, { status: 422 });
  }

  const existing = await prisma.promotion.findFirst({ where: { id: promoId, studioId } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const data: Prisma.PromotionUpdateInput = {};
  const v = parsed.data;
  if (v.name !== undefined) data.name = v.name;
  if (v.code !== undefined) data.code = v.code ? v.code.toUpperCase() : null;
  if (v.value !== undefined) data.value = new Prisma.Decimal(v.value);
  if (v.currency !== undefined) data.currency = v.currency;
  if (v.appliesToItemIds !== undefined) data.appliesToItemIds = v.appliesToItemIds;
  if (v.bundleConfig !== undefined) data.bundleConfig = v.bundleConfig as Prisma.InputJsonValue ?? null;
  if (v.startsAt !== undefined) data.startsAt = v.startsAt ? new Date(v.startsAt) : null;
  if (v.endsAt !== undefined) data.endsAt = v.endsAt ? new Date(v.endsAt) : null;
  if (v.usageLimit !== undefined) data.usageLimit = v.usageLimit;
  if (v.isActive !== undefined) data.isActive = v.isActive;

  let updated;
  try {
    updated = await prisma.promotion.update({ where: { id: promoId }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return Response.json({ error: { code: "PROMOTION_CODE_TAKEN", message: "a promotion with this code already exists" } }, { status: 409 });
    }
    throw err;
  }
  return Response.json({ promotion: toPromotionDto(updated) }, { status: 200 });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; promoId: string }> },
): Promise<Response> {
  const { id: studioId, promoId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const rl = await rateLimit({ scope: "promotions:delete", identifier: principal.kind === "user" ? principal.userId : principal.playerId, limit: 30, windowSec: 60 });
  if (!rl.allowed) return Response.json({ error: "rate limited" }, { status: 429 });

  const existing = await prisma.promotion.findFirst({ where: { id: promoId, studioId } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.promotion.delete({ where: { id: promoId } });
  return Response.json({ ok: true }, { status: 200 });
}
