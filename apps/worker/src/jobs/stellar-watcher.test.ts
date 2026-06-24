import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAndAdvanceOrder: vi.fn(),
  findMany: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: class {
      payments() {
        return this;
      }
      forAccount() {
        return this;
      }
      limit() {
        return this;
      }
      order() {
        return this;
      }
      cursor() {
        return this;
      }
      async call() {
        return { records: [] };
      }
    },
  },
}));

vi.mock("@xgamefi/shared/settlement", () => ({ verifyAndAdvanceOrder: mocks.verifyAndAdvanceOrder }));
vi.mock("@xgamefi/shared/queues", () => ({ registerWorker: vi.fn(), getRedis: () => ({ get: mocks.get, set: mocks.set }) }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { order: { findMany: mocks.findMany } } };
});
vi.mock("@xgamefi/config/env", () => ({
  env: { STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org", STELLAR_RECEIVING_ACCOUNT: "GRECEIVER" },
}));

import { stellarWatcherProcessor, matchAndAdvancePayments } from "./stellar-watcher";

beforeEach(() => {
  mocks.verifyAndAdvanceOrder.mockReset().mockResolvedValue({ status: "PAID" });
  mocks.findMany.mockReset().mockResolvedValue([{ id: "o1" }, { id: "o2" }]);
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.set.mockReset().mockResolvedValue("OK");
});

describe("matchAndAdvancePayments", () => {
  it("matches payments by order id memo", () => {
    const matched = matchAndAdvancePayments([{ id: "o1" }, { id: "o2" }], [
      { memo: "o1", txHash: "tx1" },
      { memo: "o3", txHash: "tx3" },
    ]);
    expect(matched).toEqual([{ id: "o1", txHash: "tx1" }]);
  });
});

describe("stellarWatcherProcessor", () => {
  it("returns processed count without crashing when Horizon has no records", async () => {
    const res = await stellarWatcherProcessor({ data: {} });
    expect(res.processed).toBe(0);
  });
});
