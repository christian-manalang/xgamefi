import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../../lib/auth/redis";
import { POST as register } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

const valid = {
  username: "studioboss",
  password: "correct-horse-battery",
  confirmPassword: "correct-horse-battery",
  studioName: "Boss Games",
  slug: "boss-games",
  integrationMode: "API_PULL",
};

describe("POST /auth/register", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany({ where: { username: { in: ["studioboss", "other"] } } });
    await prisma.shop.deleteMany({ where: { studio: { slug: { in: ["boss-games", "taken-slug"] } } } });
    await prisma.studio.deleteMany({ where: { slug: { in: ["boss-games", "taken-slug"] } } });
  });

  it("creates an active studio, owner user, default shop, session, and audit logs", async () => {
    const res = await register(post(valid));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/xgf_session=/);
    const body = await res.json();
    expect(body.data.role).toBe("STUDIO_OWNER");
    expect(body.data.studioId).toBeTruthy();

    const studio = await prisma.studio.findUnique({ where: { slug: "boss-games" } });
    expect(studio).not.toBeNull();
    expect(studio?.status).toBe("ACTIVE");

    const user = await prisma.user.findUnique({ where: { username: "studioboss" } });
    expect(user?.studioId).toBe(studio?.id);

    const shop = await prisma.shop.findUnique({ where: { studioId: studio!.id } });
    expect(shop).not.toBeNull();

    const audits = await prisma.auditLog.findMany({ where: { action: { in: ["studio.self_onboard", "auth.login.success"] } } });
    expect(audits.length).toBe(2);
  });

  it("rejects a mismatched password", async () => {
    const res = await register(post({ ...valid, confirmPassword: "different" }));
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate username", async () => {
    await register(post(valid));
    const res = await register(post({ ...valid, slug: "boss-games-2" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("USERNAME_TAKEN");
  });

  it("rejects a duplicate slug", async () => {
    await register(post(valid));
    const res = await register(post({ ...valid, username: "other" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SLUG_TAKEN");
  });

  it("blocks cross-origin requests (CSRF)", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.com" },
      body: JSON.stringify(valid),
    });
    const res = await register(req);
    expect(res.status).toBe(403);
  });
});
