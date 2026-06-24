import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateIngest: vi.fn(),
  upsertCatalogueItems: vi.fn(),
  idemFindUnique: vi.fn(),
  idemCreate: vi.fn(),
}));

vi.mock("../../../../../lib/ingest-auth", () => ({
  authenticateIngest: mocks.authenticateIngest,
  IngestAuthError: class extends Error { status = 401; },
}));
vi.mock("@xgamefi/shared", () => ({ upsertCatalogueItems: mocks.upsertCatalogueItems }));
vi.mock("@xgamefi/db", () => ({
  prisma: { idempotencyKey: { findUnique: mocks.idemFindUnique, create: mocks.idemCreate } },
}));

import { POST } from "./route";

function req(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.xgamefi.dev/api/v1/ingest/items", {
    method: "POST",
    body,
    headers: new Headers({ "idempotency-key": "idem-1", ...headers }),
  });
}

beforeEach(() => {
  mocks.authenticateIngest.mockReset().mockResolvedValue({ studioId: "stu1", apiKeyId: "key1" });
  mocks.upsertCatalogueItems.mockReset().mockResolvedValue({ upserted: 1, deactivated: 0 });
  mocks.idemFindUnique.mockReset().mockResolvedValue(null);
  mocks.idemCreate.mockReset().mockResolvedValue({});
});

describe("POST /ingest/items", () => {
  it("upserts valid items and returns counts", async () => {
    const body = JSON.stringify([
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1.0000000", currency: "USDT" },
    ]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upserted: 1, deactivated: 0 });
    expect(mocks.upsertCatalogueItems).toHaveBeenCalledWith("stu1", expect.any(Array));
  });

  it("returns 401 when auth fails", async () => {
    mocks.authenticateIngest.mockRejectedValue(Object.assign(new Error("bad"), { status: 401 }));
    const res = await POST(req("[]"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for schema-invalid items", async () => {
    const res = await POST(req(JSON.stringify([{ externalId: "x" }])));
    expect(res.status).toBe(400);
    expect(mocks.upsertCatalogueItems).not.toHaveBeenCalled();
  });

  it("replays a stored response for a repeated idempotency key", async () => {
    mocks.idemFindUnique.mockResolvedValue({ responseSnapshot: { upserted: 9, deactivated: 0 } });
    const res = await POST(req(JSON.stringify([
      { externalId: "a", name: "A", price: "1", currency: "XLM" },
    ])));
    expect(await res.json()).toEqual({ upserted: 9, deactivated: 0 });
    expect(mocks.upsertCatalogueItems).not.toHaveBeenCalled();
  });
});
