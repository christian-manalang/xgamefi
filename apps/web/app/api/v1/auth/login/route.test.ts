import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "../../../../../lib/auth/redis";
import { hashPassword } from "../../../../../lib/auth/password";
import { POST as login } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { username: "admin", passwordHash: await hashPassword("correct-horse"), role: "ADMIN", isActive: true },
    });
  });

  it("logs in a valid admin and sets a session cookie", async () => {
    const res = await login(post({ username: "admin", password: "correct-horse" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/xgf_session=/);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    const body = await res.json();
    expect(body.data.role).toBe("ADMIN");
    const audits = await prisma.auditLog.findMany({ where: { action: "auth.login.success" } });
    expect(audits.length).toBe(1);
  });

  it("rejects a wrong password with generic INVALID_CREDENTIALS (no cookie)", async () => {
    const res = await login(post({ username: "admin", password: "nope" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an unknown user with the same generic error", async () => {
    const res = await login(post({ username: "ghost", password: "x" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 400 on a malformed body", async () => {
    const res = await login(post({ username: "" }));
    expect(res.status).toBe(400);
  });

  it("blocks cross-origin requests (CSRF)", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.com" },
      body: JSON.stringify({ username: "admin", password: "correct-horse" }),
    });
    const res = await login(req);
    expect(res.status).toBe(403);
  });
});
