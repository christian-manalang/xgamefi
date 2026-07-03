import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../../../../../../lib/auth/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../../lib/auth/guards")>();
  return {
    ...actual,
    requireStudio: mocks.requireStudio,
    scopeToStudio: mocks.scopeToStudio,
  };
});
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { order: { findMany: mocks.findMany } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "22222222-2222-2222-2222-222222222222" }) };

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    studioId: "22222222-2222-2222-2222-222222222222",
    itemId: "33333333-3333-3333-3333-333333333333",
    playerId: "44444444-4444-4444-4444-444444444444",
    quantity: 2,
    currency: "USDT",
    grossAmount: { toString: () => "10", toFixed: () => "10.0000000" },
    discountAmount: { toString: () => "0", toFixed: () => "0.0000000" },
    platformFeeAmount: { toString: () => "0.5", toFixed: () => "0.5000000" },
    netToStudioAmount: { toString: () => "9.5", toFixed: () => "9.5000000" },
    promotionId: null,
    referralCodeUsed: null,
    idempotencyKey: "idem-1",
    stellarTxHash: "abc123",
    paymentStatus: "PAID",
    deliveryStatus: "DELIVERED",
    paidAt: new Date("2026-06-23T12:00:00.000Z"),
    deliveredAt: new Date("2026-06-23T12:01:00.000Z"),
    createdAt: new Date("2026-06-23T11:59:00.000Z"),
    updatedAt: new Date("2026-06-23T12:01:00.000Z"),
    player: { walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH2" },
    item: { name: "Energy Core" },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "22222222-2222-2222-2222-222222222222" });
  mocks.scopeToStudio.mockReset();
  mocks.findMany.mockReset();
});

describe("GET /studios/:id/orders", () => {
  it("returns tenant-isolated order DTOs with player wallet and item name", async () => {
    mocks.findMany.mockResolvedValue([makeOrder()]);
    const res = await GET(new Request("https://x/api/v1/studios/22222222-2222-2222-2222-222222222222/orders"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const first = body.data[0];
    expect(first.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(first.playerWallet).toBe("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH2");
    expect(first.itemName).toBe("Energy Core");
    expect(first.grossAmount).toBe("10.0000000");
    expect(first.paymentStatus).toBe("PAID");
    expect(first.stellarTxHash).toBe("abc123");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studioId: "22222222-2222-2222-2222-222222222222" } }),
    );
  });

  it("filters by paymentStatus and deliveryStatus", async () => {
    mocks.findMany.mockResolvedValue([makeOrder({ paymentStatus: "PAID", deliveryStatus: "DELIVERED" })]);
    const res = await GET(
      new Request(
        "https://x/api/v1/studios/22222222-2222-2222-2222-222222222222/orders?paymentStatus=PAID&deliveryStatus=DELIVERED",
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studioId: "22222222-2222-2222-2222-222222222222",
          paymentStatus: "PAID",
          deliveryStatus: "DELIVERED",
        },
      }),
    );
  });

  it("paginates with cursor", async () => {
    mocks.findMany.mockResolvedValue([
      makeOrder({ id: "11111111-1111-1111-1111-111111111112" }),
      makeOrder({ id: "11111111-1111-1111-1111-111111111111" }),
    ]);
    const res = await GET(
      new Request(
        "https://x/api/v1/studios/22222222-2222-2222-2222-222222222222/orders?limit=1",
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBe("11111111-1111-1111-1111-111111111112");
  });

  it("rejects an out-of-scope studio member", async () => {
    mocks.requireStudio.mockRejectedValueOnce(new Error("forbidden"));
    const res = await GET(new Request("https://x/api/v1/studios/22222222-2222-2222-2222-222222222222/orders"), ctx);
    expect(res.status).toBe(500);
  });
});
