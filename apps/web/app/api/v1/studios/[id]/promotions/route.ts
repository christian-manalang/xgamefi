import { prisma, Prisma } from "@xgamefi/db";
import { toPromotionDto } from "@xgamefi/shared/dto";
import { CreatePromotionInput } from "@xgamefi/shared/zod/promotion";
import { requireStudio, scopeToStudio } from "../../../../../../lib/auth/guards";
import { rateLimit } from "../../../../../../lib/auth/ratelimit";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const rl = await rateLimit({ scope: "promotions:list", identifier: principal.kind === "user" ? principal.userId : principal.playerId, limit: 60, windowSec: 60 });
  if (!rl.allowed) return Response.json({ error: "rate limited" }, { status: 429 });

  const rows = await prisma.promotion.findMany({
    where: { studioId },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ promotions: rows.map(toPromotionDto) }, { status: 200 });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const rl = await rateLimit({ scope: "promotions:create", identifier: principal.kind === "user" ? principal.userId : principal.playerId, limit: 30, windowSec: 60 });
  if (!rl.allowed) return Response.json({ error: "rate limited" }, { status: 429 });

  const parsed = CreatePromotionInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid input", issues: parsed.error.issues }, { status: 422 });
  }

  const { name, type, value, currency, appliesToItemIds, bundleConfig, startsAt, endsAt, usageLimit, isActive } = parsed.data;

  const row = await prisma.promotion.create({
    data: {
      studioId,
      name,
      type,
      value: new Prisma.Decimal(value),
      currency: currency ?? null,
      appliesToItemIds,
      bundleConfig: bundleConfig as Prisma.InputJsonValue ?? null,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      usageLimit: usageLimit ?? null,
      isActive,
    },
  });

  return Response.json({ promotion: toPromotionDto(row) }, { status: 201 });
}
