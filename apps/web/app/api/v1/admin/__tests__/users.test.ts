import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireRole } = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole }));

const { userFindMany } = vi.hoisted(() => ({
  userFindMany: vi.fn(),
}));

vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { user: { findMany: userFindMany } } };
});

import { GET } from "../users/route";
import { HttpError } from "@/lib/http";

describe("GET /admin/users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await GET(new Request("http://x/api/v1/admin/users"));
    expect(res.status).toBe(403);
  });

  it("returns users without leaking passwordHash", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    userFindMany.mockResolvedValueOnce([
      {
        id: "u2",
        username: "studio1",
        role: "STUDIO_OWNER",
        studioId: "s1",
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(0),
      },
    ]);
    const res = await GET(new Request("http://x/api/v1/admin/users"));
    const body = await res.json();
    expect(body.data[0].username).toBe("studio1");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });
});
