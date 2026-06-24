import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { redis } from "./redis";
import { createSession, readSession, revokeSession } from "./session";

describe("session lifecycle", () => {
  let userId: string;
  beforeEach(async () => {
    await redis.flushdb();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    const u = await prisma.user.create({
      data: { username: "sess-user", passwordHash: "x", role: "ADMIN", isActive: true },
    });
    userId = u.id;
  });

  it("creates a session readable via its id, with DB row + Redis mirror", async () => {
    const { sessionId } = await createSession({
      subject: { kind: "user", userId }, userAgent: "vitest", ip: "127.0.0.1",
    });
    expect(await readSession(sessionId)).toEqual({ kind: "user", userId });
    const rows = await prisma.session.findMany({ where: { userId } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.revokedAt).toBeNull();
  });

  it("returns null for an unknown session id", async () => {
    expect(await readSession("nope")).toBeNull();
  });

  it("revoking a session makes it unreadable and sets revokedAt", async () => {
    const { sessionId } = await createSession({
      subject: { kind: "user", userId }, userAgent: "vitest", ip: "127.0.0.1",
    });
    await revokeSession(sessionId);
    expect(await readSession(sessionId)).toBeNull();
    const row = await prisma.session.findFirst({ where: { userId } });
    expect(row?.revokedAt).not.toBeNull();
  });
});
