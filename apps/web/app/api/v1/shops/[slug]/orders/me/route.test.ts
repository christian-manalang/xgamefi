import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  getPlayerShopOrders: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal: mocks.requirePrincipal }));
vi.mock("@/lib/player-order-queries", () => ({ getPlayerShopOrders: mocks.getPlayerShopOrders }));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ slug: "gridlock" }) };
const playerPrincipal = { kind: "player" as const, playerId: "p1", walletAddress: "GADDR" };

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue(playerPrincipal);
  mocks.getPlayerShopOrders.mockReset().mockResolvedValue({
    orders: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/v1/shops/:slug/orders/me", () => {
  it("returns the player's paginated orders for the shop", async () => {
    const orders = [
      {
        id: "order-1",
        studioId: "stu1",
        itemId: "i1",
        playerId: "p1",
        quantity: 1,
        currency: "USDT" as const,
        grossAmount: "10.0000000",
        discountAmount: "0.0000000",
        platformFeeAmount: "0.5000000",
        netToStudioAmount: "9.5000000",
        promotionId: null,
        referralCodeUsed: null,
        paymentStatus: "PAID" as const,
        deliveryStatus: "DELIVERED" as const,
        stellarTxHash: "txhash",
        paidAt: "2026-07-01T12:00:00.000Z",
        deliveredAt: "2026-07-01T12:05:00.000Z",
        createdAt: "2026-07-01T12:00:00.000Z",
        item: { id: "i1", name: "Sword Skin", imageUrl: null },
      },
    ];
    mocks.getPlayerShopOrders.mockResolvedValue({ orders, total: 1, page: 2, pageSize: 10 });

    const res = await GET(new Request("https://x/api/v1/shops/gridlock/orders/me?page=2&pageSize=10"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orders, total: 1, page: 2, pageSize: 10 });
    expect(mocks.getPlayerShopOrders).toHaveBeenCalledWith("gridlock", "p1", { page: 2, pageSize: 10 });
  });

  it("returns 401 when the caller is not authenticated", async () => {
    mocks.requirePrincipal.mockRejectedValue(new Error("unauthenticated"));
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/orders/me"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the principal is not a player", async () => {
    mocks.requirePrincipal.mockResolvedValue({ kind: "user" as const, userId: "u1", role: "ADMIN" as const });
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/orders/me"), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid pageSize", async () => {
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/orders/me?pageSize=999"), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the shop is not published", async () => {
    mocks.getPlayerShopOrders.mockResolvedValue(null);
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/orders/me"), ctx);
    expect(res.status).toBe(404);
  });
});
