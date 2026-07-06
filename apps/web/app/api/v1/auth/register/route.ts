import { StudioSelfOnboardInput } from "@xgamefi/shared/zod/auth";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { prisma } from "@xgamefi/db";
import {
  assertPublicUrl,
  getPlatformSettings,
  writeAudit,
} from "@xgamefi/shared";
import { hashPassword } from "../../../../../lib/auth/password";
import { createSession, buildSessionSetCookie } from "../../../../../lib/auth/session";
import { assertCsrf } from "../../../../../lib/auth/csrf";
import { rateLimit } from "../../../../../lib/auth/ratelimit";
import { jsonOk, jsonError, errorToResponse, getClientIp } from "../../../../../lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    assertCsrf(req);
    const ip = getClientIp(req);
    const rl = await rateLimit({
      scope: "auth:register",
      identifier: ip,
      limit: 5,
      windowSec: 3600,
    });
    if (!rl.allowed) return jsonError(429, "RATE_LIMITED");

    const parsed = StudioSelfOnboardInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT");
    const input = parsed.data;

    if (input.apiBaseUrl) {
      try {
        await assertPublicUrl(input.apiBaseUrl);
      } catch {
        return jsonError(400, "INVALID_API_BASE_URL");
      }
    }

    const [existingUser, existingSlug] = await Promise.all([
      prisma.user.findUnique({ where: { username: input.username } }),
      prisma.studio.findUnique({ where: { slug: input.slug } }),
    ]);
    if (existingUser) return jsonError(409, "USERNAME_TAKEN");
    if (existingSlug) return jsonError(409, "SLUG_TAKEN");

    const settings = await getPlatformSettings();
    const passwordHash = await hashPassword(input.password);

    const { studio, user } = await prisma.$transaction(async (tx) => {
      const studio = await tx.studio.create({
        data: {
          name: input.studioName,
          slug: input.slug,
          payoutWalletAddress: input.payoutWalletAddress ?? null,
          integrationMode: input.integrationMode,
          apiBaseUrl: input.apiBaseUrl ?? null,
          platformFeeBps: settings.defaultFeeBps,
          status: "ACTIVE",
        },
      });
      await tx.shop.create({
        data: {
          studioId: studio.id,
          layout: { mode: "grid", sections: [] },
          theme: {},
          featuredItemIds: [],
        },
      });
      const user = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          role: "STUDIO_OWNER",
          studioId: studio.id,
          lastLoginAt: new Date(),
        },
      });
      return { studio, user };
    });

    const { sessionId } = await createSession({
      subject: { kind: "user", userId: user.id },
      userAgent: req.headers.get("user-agent") ?? "",
      ip,
    });

    await writeAudit({
      actorType: "USER",
      actorUserId: user.id,
      action: "studio.self_onboard",
      entityType: "Studio",
      entityId: studio.id,
      metadata: { slug: studio.slug },
      ip,
    });
    await writeAudit({
      actorType: "USER",
      actorUserId: user.id,
      action: "auth.login.success",
      entityType: "User",
      entityId: user.id,
      ip,
    });

    return jsonOk(
      toMeDto({
        kind: "user",
        userId: user.id,
        role: "STUDIO_OWNER",
        studioId: studio.id,
      }),
      { headers: { "set-cookie": buildSessionSetCookie(sessionId) } },
    );
  } catch (e) {
    return errorToResponse(e);
  }
}
