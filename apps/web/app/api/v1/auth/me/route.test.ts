import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../../lib/auth/redis";
import { createSession } from "../../../../../lib/auth/session";

// Mock the cookie jar so getPrincipal reads our test session id.
let cookieValue: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === "xgf_session" && cookieValue ? { value: cookieValue } : undefined),
    set: () => {}, delete: () => {},
  }),
}));

import { GET as me } from "./route";

describe("GET /auth/me", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    cookieValue = null;
  });

  it("returns 401 with no session", async () => {
    const res = await me(new Request("http://localhost:3000/api/v1/auth/me"));
    expect(res.status).toBe(401);
  });

  it("returns the principal for a valid user session", async () => {
    const studio = await prisma.studio.upsert({ where: { slug: "me-stu" }, update: {}, create: { name: "S", slug: "me-stu", platformFeeBps: 500 } });
    const u = await prisma.user.create({ data: { username: "me-user", passwordHash: "x", role: "STUDIO_OWNER", studioId: studio.id, isActive: true } });
    const { sessionId } = await createSession({ subject: { kind: "user", userId: u.id }, userAgent: "v", ip: "127.0.0.1" });
    cookieValue = sessionId;
    const res = await me(new Request("http://localhost:3000/api/v1/auth/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ kind: "user", userId: u.id, role: "STUDIO_OWNER", studioId: studio.id });
  });
});
