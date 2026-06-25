import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireStudio } = vi.hoisted(() => ({
  requireStudio: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireStudio }));

const {
  deliveryFindMany,
  deliveryFindFirst,
  deliveryUpdate,
  deliveryCreate,
  studioFindUnique,
} = vi.hoisted(() => ({
  deliveryFindMany: vi.fn(),
  deliveryFindFirst: vi.fn(),
  deliveryUpdate: vi.fn(),
  deliveryCreate: vi.fn(),
  studioFindUnique: vi.fn(),
}));

vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    prisma: {
      webhookDelivery: {
        findMany: deliveryFindMany,
        findFirst: deliveryFindFirst,
        update: deliveryUpdate,
        create: deliveryCreate,
      },
      studio: { findUnique: studioFindUnique },
    },
  };
});

const { queueAdd, getQueue, writeAudit } = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  getQueue: vi.fn(() => ({ add: queueAdd })),
  writeAudit: vi.fn(),
}));

vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getQueue, writeAudit };
});

import { GET as listDeliveries } from "../[id]/webhooks/deliveries/route";
import { POST as retryDelivery } from "../[id]/webhooks/deliveries/[deliveryId]/retry/route";

const delivery = {
  id: "d1",
  studioId: "s1",
  event: "purchase.completed",
  orderId: "o1",
  tradeId: null,
  url: "https://hooks.gridlock.gg/x",
  status: "EXHAUSTED",
  attempt: 5,
  maxAttempts: 5,
  responseStatus: 500,
  nextAttemptAt: null,
  createdAt: new Date(0),
  deliveredAt: null,
};

describe("webhook delivery ops", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists deliveries scoped to the studio", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    deliveryFindMany.mockResolvedValueOnce([delivery]);
    const res = await listDeliveries(
      new Request("http://x/api/v1/studios/s1/webhooks/deliveries"),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe("d1");
    expect(deliveryFindMany.mock.calls[0][0].where.studioId).toBe("s1");
  });

  it("manual retry re-enqueues the webhook-delivery job and resets state", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    deliveryFindFirst.mockResolvedValueOnce(delivery);
    deliveryUpdate.mockResolvedValueOnce({ ...delivery, status: "PENDING", attempt: 0 });
    const res = await retryDelivery(
      new Request("http://x/api/v1/studios/s1/webhooks/deliveries/d1/retry", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "s1", deliveryId: "d1" }) },
    );
    expect(res.status).toBe(202);
    expect(getQueue).toHaveBeenCalledWith("webhook-delivery");
    expect(queueAdd).toHaveBeenCalledWith("deliver", { deliveryId: "d1" });
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING", attempt: 0 }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "webhook.retry" }));
  });

  it("rejects retry of an already-DELIVERED delivery with 409", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    deliveryFindFirst.mockResolvedValueOnce({ ...delivery, status: "DELIVERED" });
    const res = await retryDelivery(
      new Request("http://x/api/v1/studios/s1/webhooks/deliveries/d1/retry", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "s1", deliveryId: "d1" }) },
    );
    expect(res.status).toBe(409);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
