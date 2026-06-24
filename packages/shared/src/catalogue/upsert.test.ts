import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { $transaction: mocks.$transaction } };
});

import { upsertCatalogueItems } from "./upsert";

beforeEach(() => {
  mocks.upsert.mockReset().mockResolvedValue({});
  mocks.updateMany.mockReset().mockResolvedValue({ count: 3 });
  mocks.$transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ item: { upsert: mocks.upsert, updateMany: mocks.updateMany } }),
  );
});

describe("upsertCatalogueItems", () => {
  it("upserts each item by (studioId, externalId) and deactivates stale", async () => {
    const res = await upsertCatalogueItems("stu1", [
      { externalId: "a", name: "A", price: "1.0000000", currency: "USDT" },
      { externalId: "b", name: "B", price: "2", currency: "XLM" },
    ]);

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    const firstCall = mocks.upsert.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0].where).toEqual({
      studioId_externalId: { studioId: "stu1", externalId: "a" },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { studioId: "stu1", externalId: { notIn: ["a", "b"] }, isActive: true },
      data: { isActive: false },
    });
    expect(res).toEqual({ upserted: 2, deactivated: 3 });
  });

  it("deactivates all active items when given an empty list", async () => {
    await upsertCatalogueItems("stu1", []);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { studioId: "stu1", externalId: { notIn: [] }, isActive: true },
      data: { isActive: false },
    });
  });
});
