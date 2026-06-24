import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { GET } from "./me/route";
import { prisma, Prisma } from "@xgamefi/db";
import { randomUUID } from "node:crypto";

vi.mock("../../../../lib/auth/guards", () => ({
  requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: PLAYER, walletAddress: `G${PLAYER.replace(/-/g, "").slice(0, 20)}` })),
}));
vi.mock("../../../../lib/auth/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
}));

let PLAYER: string;

describe("POST /referrals", () => {
  beforeEach(async () => {
    PLAYER = randomUUID();
    await prisma.referral.deleteMany({ where: { referrerPlayerId: PLAYER } });
    await prisma.player.deleteMany({ where: { id: PLAYER } });
    await prisma.player.create({ data: { id: PLAYER, walletAddress: `G${PLAYER.replace(/-/g, "").slice(0, 20)}` } });
  });

  it("generates a code and returns the same code on repeat (idempotent)", async () => {
    const r1 = await POST(new Request("http://t", { method: "POST" }));
    const c1 = (await r1.json()).code;
    expect(c1).toMatch(/^[A-Z0-9]{6,}$/);
    const r2 = await POST(new Request("http://t", { method: "POST" }));
    expect((await r2.json()).code).toBe(c1);
    expect(await prisma.referral.count({ where: { referrerPlayerId: PLAYER, refereePlayerId: null } })).toBe(1);
  });

  it("GET /referrals/me reports performance counts", async () => {
    await POST(new Request("http://t", { method: "POST" }));
    const own = await prisma.referral.findFirst({ where: { referrerPlayerId: PLAYER, refereePlayerId: null } });
    const invitee1 = randomUUID();
    const invitee2 = randomUUID();
    await prisma.player.createMany({ data: [
      { id: invitee1, walletAddress: `G${invitee1.replace(/-/g, "").slice(0, 20)}` },
      { id: invitee2, walletAddress: `G${invitee2.replace(/-/g, "").slice(0, 20)}` },
    ]});
    await prisma.referral.create({ data: { code: `${own!.code}X`, referrerPlayerId: PLAYER, refereePlayerId: invitee1, status: "REWARDED", rewardAmount: new Prisma.Decimal("0.5"), rewardCurrency: "USDT" } });
    await prisma.referral.create({ data: { code: `${own!.code}Y`, referrerPlayerId: PLAYER, refereePlayerId: invitee2, status: "QUALIFIED" } });
    const res = await GET(new Request("http://t"));
    const b = await res.json();
    expect(b.qualified).toBe(1);
    expect(b.rewarded).toBe(1);
    expect(b.totalRewardAmount).toBe("0.5000000");
  });
});
