import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  withIdempotency: vi.fn(),
  verifyAndAdvanceOrder: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePrincipal: mocks.requirePrincipal }));
vi.mock("@xgamefi/shared/idempotency", () => ({
  withIdempotency: mocks.withIdempotency,
  IdempotencyConflictError: class extends Error {},
}));
vi.mock("@xgamefi/shared/settlement", () => ({ verifyAndAdvanceOrder: mocks.verifyAndAdvanceOrder }));
vi.mock("@/lib/checkout-queries", () => ({ getOrder: mocks.getOrder }));

import { POST } from "./route";

const ORDER_ID = "11111111-1111-1111-1111-111111111111";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: new Headers({ "idempotency-key": "idem-1", ...headers }),
  });
}

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  mocks.withIdempotency.mockReset().mockImplementation(async (_args, fn) => fn());
  mocks.verifyAndAdvanceOrder.mockReset().mockResolvedValue({ status: "PAID" });
  mocks.getOrder.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    itemId: "i1",
    playerId: "p1",
    quantity: 1,
    currency: "USDT",
    grossAmount: { toFixed: () => "1.0000000" },
    discountAmount: { toFixed: () => "0" },
    platformFeeAmount: { toFixed: () => "0.0500000" },
    netToStudioAmount: { toFixed: () => "0.9500000" },
    idempotencyKey: "idem-1",
    stellarTxHash: "tx1",
    paymentStatus: "PAID",
    deliveryStatus: "PENDING",
    paidAt: new Date(),
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("POST /checkout/submit", () => {
  it("requires idempotency-key header", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ orderId: ORDER_ID, txHash: "tx1" }) }));
    expect(res.status).toBe(400);
  });

  it("calls verifyAndAdvanceOrder and returns order + result", async () => {
    const res = await POST(req({ orderId: ORDER_ID, txHash: "tx1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.status).toBe("PAID");
    expect(body.order.id).toBe("o1");
    expect(mocks.verifyAndAdvanceOrder).toHaveBeenCalledWith({ orderId: ORDER_ID, txHash: "tx1" });
  });

  it("returns 403 for non-player principal", async () => {
    mocks.requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN", userId: "u1" });
    const res = await POST(req({ orderId: ORDER_ID, txHash: "tx1" }));
    expect(res.status).toBe(403);
  });

  it("returns REJECTED result without throwing", async () => {
    mocks.verifyAndAdvanceOrder.mockResolvedValue({ status: "REJECTED", reason: "memo mismatch" });
    const res = await POST(req({ orderId: ORDER_ID, txHash: "tx1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.status).toBe("REJECTED");
  });
});
