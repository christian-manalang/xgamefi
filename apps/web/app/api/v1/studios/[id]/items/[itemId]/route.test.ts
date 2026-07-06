import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  shopUpdate: vi.fn(),
  shopFindUnique: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("../../../../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  scopeToStudio: mocks.scopeToStudio,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: {
    item: { findFirst: mocks.findFirst, update: mocks.update },
    shop: { findUnique: mocks.shopFindUnique, update: mocks.shopUpdate },
    auditLog: { create: mocks.auditCreate },
  } };
});

import { PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "stu1", itemId: "i1" }) };

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.scopeToStudio.mockReset();
  mocks.findFirst.mockReset().mockResolvedValue({ id: "i1", studioId: "stu1" });
  mocks.update.mockReset().mockResolvedValue({
    id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
    description: null, imageUrl: null,
    priceAmount: { toString: () => "2.5", toFixed: () => "2.5000000" },
    priceCurrency: "USDT", stock: 5, rarity: null, category: null, metadata: {}, isActive: true, isListed: true, syncedAt: null,
  });
  mocks.shopFindUnique.mockReset().mockResolvedValue({ studioId: "stu1", featuredItemIds: [] });
  mocks.shopUpdate.mockReset();
});

describe("PATCH /studios/:id/items/:itemId", () => {
  it("applies price/stock overrides and returns the DTO", async () => {
    const res = await PATCH(new Request("https://x", {
      method: "PATCH", body: JSON.stringify({ priceAmount: "2.5", stock: 5 }),
    }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalled();
    const body = await res.json();
    expect(body.item.price.amount).toBe("2.5000000");
  });
  it("adds the item to Shop.featuredItemIds when featured=true", async () => {
    await PATCH(new Request("https://x", { method: "PATCH", body: JSON.stringify({ featured: true }) }), ctx);
    expect(mocks.shopUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { featuredItemIds: ["i1"] },
    }));
  });
  it("400s on an empty override body", async () => {
    const res = await PATCH(new Request("https://x", { method: "PATCH", body: "{}" }), ctx);
    expect(res.status).toBe(400);
  });
  it("404s when the item is not in the studio", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await PATCH(new Request("https://x", {
      method: "PATCH", body: JSON.stringify({ stock: 1 }),
    }), ctx);
    expect(res.status).toBe(404);
  });
  it("updates metadata fields and isListed", async () => {
    const res = await PATCH(new Request("https://x", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed", category: "skin", isListed: false }),
    }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Renamed", category: "skin", isListed: false }),
    }));
  });
  it("writes an audit log", async () => {
    await PATCH(new Request("https://x", { method: "PATCH", body: JSON.stringify({ stock: 1 }) }), ctx);
    expect(mocks.auditCreate).toHaveBeenCalled();
  });
});
