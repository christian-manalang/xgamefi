import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { prisma } from "@xgamefi/db";
import { randomUUID } from "node:crypto";

vi.mock("../../../../../../lib/auth/guards", async (orig) => {
  const mod = await orig<typeof import("../../../../../../lib/auth/guards")>();
  return {
    ...mod,
    requireStudio: vi.fn(async (sid: string) => ({ kind: "user", userId: "u1", role: "STUDIO_OWNER", studioId: sid })),
    scopeToStudio: vi.fn(() => {}),
  };
});

vi.mock("../../../../../../lib/auth/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
}));

describe("POST /studios/:id/promotions", () => {
  let studioId: string;

  beforeEach(async () => {
    studioId = randomUUID();
    await prisma.promotion.deleteMany({ where: { studioId } });
    await prisma.studio.upsert({
      where: { id: studioId },
      update: {},
      create: { id: studioId, name: "Gridlock", slug: studioId.slice(0, 8), payoutWalletAddress: "G", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
    });
  });

  it("creates a PERCENT promotion scoped to the studio", async () => {
    const req = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "Launch", type: "PERCENT", value: "10" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: studioId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.promotion.type).toBe("PERCENT");
    expect(body.promotion.value).toBe("10.0000000");
    expect(body.promotion.usageCount).toBe(0);
    const row = await prisma.promotion.findUnique({ where: { id: body.promotion.id } });
    expect(row?.studioId).toBe(studioId);
  });

  it("stores the coupon code uppercased", async () => {
    const req = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "Coded", code: "save20", type: "PERCENT", value: "20" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: studioId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.promotion.code).toBe("SAVE20");
  });

  it("409s when the code already exists for the studio (any case)", async () => {
    const first = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "A", code: "SAVE20", type: "PERCENT", value: "20" }),
    });
    await POST(first, { params: Promise.resolve({ id: studioId }) });
    const second = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "B", code: "save20", type: "PERCENT", value: "10" }),
    });
    const res = await POST(second, { params: Promise.resolve({ id: studioId }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("PROMOTION_CODE_TAKEN");
  });

  it("rejects BUNDLE without bundleConfig (422)", async () => {
    const req = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "B", type: "BUNDLE", value: "1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: studioId }) });
    expect(res.status).toBe(422);
  });

  it("lists only the studio's promotions", async () => {
    await prisma.promotion.create({ data: { studioId, name: "P", type: "FIXED", value: new (await import("@xgamefi/db")).Prisma.Decimal("0.5"), currency: "USDT", appliesToItemIds: [], usageCount: 0, isActive: true } });
    const res = await GET(new Request("http://t"), { params: Promise.resolve({ id: studioId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promotions).toHaveLength(1);
  });
});
