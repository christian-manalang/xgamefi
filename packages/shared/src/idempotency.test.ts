import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { idempotencyKey: { findUnique: mocks.findUnique, create: mocks.create } } };
});

const redis = { set: mocks.set, get: mocks.get, del: mocks.del };

import { withIdempotency, IdempotencyConflictError } from "./idempotency";

beforeEach(() => {
  mocks.findUnique.mockReset();
  mocks.create.mockReset();
  mocks.set.mockReset().mockResolvedValue("OK");
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.del.mockReset().mockResolvedValue(1);
});

describe("withIdempotency", () => {
  it("runs fn and stores the snapshot on first call", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await withIdempotency(
      { key: "k1", scope: "checkout:submit", requestHash: "h1" },
      async () => ({ status: "PAID" }),
      redis as never,
    );
    expect(res).toEqual({ status: "PAID" });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: "k1", scope: "checkout:submit", requestHash: "h1" }),
      }),
    );
  });

  it("replays a stored snapshot for the same key+hash", async () => {
    mocks.findUnique.mockResolvedValue({ responseSnapshot: { status: "PAID" }, requestHash: "h1" });
    const fn = vi.fn();
    const res = await withIdempotency(
      { key: "k1", scope: "checkout:submit", requestHash: "h1" },
      fn,
      redis as never,
    );
    expect(res).toEqual({ status: "PAID" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws IdempotencyConflictError when key exists with a different hash", async () => {
    mocks.findUnique.mockResolvedValue({ responseSnapshot: { status: "PAID" }, requestHash: "other" });
    await expect(
      withIdempotency(
        { key: "k1", scope: "checkout:submit", requestHash: "h1" },
        async () => ({ status: "PAID" }),
        redis as never,
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
