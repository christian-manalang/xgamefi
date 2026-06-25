import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireRole, computePlatformMetrics } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  computePlatformMetrics: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, computePlatformMetrics };
});

import { GET } from "../metrics/route";
import { Prisma } from "@xgamefi/db";
import { HttpError } from "@/lib/http";

describe("GET /admin/metrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies a non-admin principal with 403", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await GET(new Request("http://x/api/v1/admin/metrics"));
    expect(res.status).toBe(403);
    expect(computePlatformMetrics).not.toHaveBeenCalled();
  });

  it("returns mapped metrics DTO for an admin", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    computePlatformMetrics.mockResolvedValueOnce({
      gmv: new Prisma.Decimal("2"),
      feesCollected: new Prisma.Decimal("0.1"),
      activeStudios: 3,
      recentOrders: [],
    });
    const res = await GET(new Request("http://x/api/v1/admin/metrics"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gmv).toBe("2.0000000");
    expect(body.data.activeStudios).toBe(3);
    expect(requireRole).toHaveBeenCalledWith("ADMIN");
  });
});
