import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@xgamefi/db";
import { randomUUID } from "node:crypto";

let CURRENT: string;
const REFERRER = "00000000-0000-0000-0000-0000000000a1";

vi.mock("../../../../../lib/auth/guards", () => ({
  requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: CURRENT, walletAddress: `G${CURRENT.replace(/-/g, "").slice(0, 20)}` })),
}));
vi.mock("../../../../../lib/auth/ratelimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

async function refCode() {
  await prisma.player.deleteMany({ where: { id: REFERRER } });
  await prisma.player.create({ data: { id: REFERRER, walletAddress: `G${REFERRER.replace(/-/g, "").slice(0, 20)}` } });
  const r = await prisma.referral.create({ data: { code: "ABC123", referrerPlayerId: REFERRER, refereePlayerId: null, status: "PENDING" } });
  return r.code;
}

describe("POST /referrals/bind", () => {
  beforeEach(async () => {
    CURRENT = randomUUID();
    await prisma.referral.deleteMany({ where: { OR: [{ referrerPlayerId: REFERRER }, { refereePlayerId: CURRENT }] } });
    await prisma.player.deleteMany({ where: { id: { in: [REFERRER, CURRENT] } } });
    await prisma.player.create({ data: { id: CURRENT, walletAddress: `G${CURRENT.replace(/-/g, "").slice(0, 20)}` } });
  });

  it("binds invitee to referrer and creates a PENDING per-invitee referral", async () => {
    const code = await refCode();
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code }) }));
    expect(res.status).toBe(200);
    const player = await prisma.player.findUnique({ where: { id: CURRENT } });
    expect(player?.referredByPlayerId).toBe(REFERRER);
    const inviteeRef = await prisma.referral.findFirst({ where: { refereePlayerId: CURRENT, status: "PENDING" } });
    expect(inviteeRef?.referrerPlayerId).toBe(REFERRER);
  });

  it("is a no-op when already bound", async () => {
    const code = await refCode();
    await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code }) }));
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code }) }));
    expect(res.status).toBe(200);
    expect(await prisma.referral.count({ where: { refereePlayerId: CURRENT } })).toBe(1);
  });

  it("rejects self-referral (referrer == invitee)", async () => {
    CURRENT = REFERRER;
    await prisma.player.create({ data: { id: REFERRER, walletAddress: `G${REFERRER.replace(/-/g, "").slice(0, 20)}` } });
    const r = await prisma.referral.create({ data: { code: "SELF12", referrerPlayerId: REFERRER, refereePlayerId: null, status: "PENDING" } });
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code: r.code }) }));
    expect(res.status).toBe(409);
    expect(await prisma.player.findUnique({ where: { id: REFERRER } }).then(p => p?.referredByPlayerId)).toBeNull();
  });
});
