import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireRole, findMany } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { ledgerEntry: { findMany } } };
});

import { GET } from "../ledger/route";
import { HttpError } from "@/lib/http";

describe("GET /admin/ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin with 403", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await GET(new Request("http://x/api/v1/admin/ledger"));
    expect(res.status).toBe(403);
  });

  it("returns mapped ledger entries with a nextCursor", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    findMany.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        type: "SALE_IN",
        orderId: null,
        tradeId: null,
        referralId: null,
        stellarTxHash: "abc",
        sourceAddress: "G1",
        destAddress: "G2",
        amount: { toString: () => "1.5" },
        assetCode: "USDT",
        assetIssuer: null,
        status: "ok",
        createdAt: new Date(0),
      },
    ]);
    const res = await GET(new Request("http://x/api/v1/admin/ledger?limit=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].type).toBe("SALE_IN");
    expect(body.data[0].amount).toBe("1.5");
  });
});
