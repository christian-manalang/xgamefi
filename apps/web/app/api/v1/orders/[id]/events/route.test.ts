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
vi.mock("@xgamefi/shared/queues", () => ({
  getRedisSubscriber: () => ({
    subscribe: vi.fn().mockResolvedValue("OK"),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  mocks.findUnique.mockReset().mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", playerId: "p1", paymentStatus: "PENDING" });
});

describe("GET /orders/:id/events", () => {
  it("returns an SSE response for the order owner", async () => {
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("content-encoding")).toBe("identity");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("returns 403 if the principal does not own the order", async () => {
    mocks.findUnique.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", playerId: "p2", paymentStatus: "PENDING" });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(403);
  });
});
