import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH, DELETE } from "./route";
import { prisma, Prisma } from "@xgamefi/db";
import { randomUUID } from "node:crypto";

vi.mock("../../../../../../../lib/auth/guards", async (orig) => {
  const mod = await orig<typeof import("../../../../../../../lib/auth/guards")>();
  return {
    ...mod,
    requireStudio: vi.fn(async (sid: string) => ({ kind: "user", userId: "u1", role: "STUDIO_OWNER", studioId: sid })),
    scopeToStudio: vi.fn(() => {}),
  };
});

vi.mock("../../../../../../../lib/auth/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
}));

describe("PATCH/DELETE /studios/:id/promotions/:promoId", () => {
  let studioId: string;
  let otherStudioId: string;
  let promoId: string;

  beforeEach(async () => {
    studioId = randomUUID();
    otherStudioId = randomUUID();
    await prisma.promotion.deleteMany({ where: { studioId: { in: [studioId, otherStudioId] } } });
    await prisma.studio.upsert({
      where: { id: studioId },
      update: {},
      create: { id: studioId, name: "A", slug: studioId.slice(0, 8), payoutWalletAddress: "G", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
    });
    await prisma.studio.upsert({
      where: { id: otherStudioId },
      update: {},
      create: { id: otherStudioId, name: "B", slug: otherStudioId.slice(0, 8), payoutWalletAddress: "G", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
    });
    const p = await prisma.promotion.create({ data: { studioId, name: "P", type: "PERCENT", value: new Prisma.Decimal("10"), appliesToItemIds: [], usageCount: 0, isActive: true } });
    promoId = p.id;
  });

  it("updates a promotion's isActive flag", async () => {
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: studioId, promoId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promotion.isActive).toBe(false);
  });

  it("404s when promotion belongs to another studio", async () => {
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: otherStudioId, promoId }) });
    expect(res.status).toBe(404);
  });

  it("deletes a promotion", async () => {
    const res = await DELETE(new Request("http://t"), { params: Promise.resolve({ id: studioId, promoId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const row = await prisma.promotion.findUnique({ where: { id: promoId } });
    expect(row).toBeNull();
  });
});
