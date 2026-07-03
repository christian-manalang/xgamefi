import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal: mocks.requirePrincipal }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { order: { findUnique: mocks.findUnique } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  mocks.findUnique.mockReset().mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", playerId: "p1", paymentStatus: "PENDING", deliveryStatus: "PENDING" });
});

describe("GET /orders/:id", () => {
  it("returns the order status for the owner", async () => {
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ paymentStatus: "PENDING", deliveryStatus: "PENDING" });
  });

  it("returns 403 if the principal does not own the order", async () => {
    mocks.findUnique.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", playerId: "p2", paymentStatus: "PENDING", deliveryStatus: "PENDING" });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the order does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
