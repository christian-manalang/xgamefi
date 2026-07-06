import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { order: { findMany: mocks.findMany } } };
});

import { listStudioOrders } from "./order-queries";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    studioId: "stu1",
    itemId: "i1",
    playerId: "p1",
    quantity: 1,
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
    player: { walletAddress: "GADDR" },
    item: { name: "Energy Core" },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.findMany.mockReset();
});

describe("listStudioOrders", () => {
  it("returns mapped orders with wallet and item name", async () => {
    mocks.findMany.mockResolvedValue([makeOrder()]);
    const result = await listStudioOrders({ studioId: "stu1" });
    expect(result.data).toHaveLength(1);
    const [first] = result.data;
    expect(first).toBeDefined();
    expect(first!.playerWallet).toBe("GADDR");
    expect(first!.itemName).toBe("Energy Core");
    expect(first!.grossAmount).toBe("10.0000000");
  });

  it("applies payment and delivery status filters", async () => {
    mocks.findMany.mockResolvedValue([makeOrder()]);
    await listStudioOrders({ studioId: "stu1", paymentStatus: "PAID", deliveryStatus: "DELIVERED" });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studioId: "stu1",
          paymentStatus: "PAID",
          deliveryStatus: "DELIVERED",
        },
      }),
    );
  });

  it("paginates with a cursor", async () => {
    mocks.findMany.mockResolvedValue([makeOrder({ id: "22222222-2222-2222-2222-222222222222" }), makeOrder()]);
    const result = await listStudioOrders({ studioId: "stu1", cursor: "11111111-1111-1111-1111-111111111111", limit: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.nextCursor).toBe("22222222-2222-2222-2222-222222222222");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "11111111-1111-1111-1111-111111111111" },
        skip: 1,
      }),
    );
  });

  it("returns null cursor when there are no more rows", async () => {
    mocks.findMany.mockResolvedValue([makeOrder()]);
    const result = await listStudioOrders({ studioId: "stu1", limit: 5 });
    expect(result.nextCursor).toBeNull();
  });
});
