import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { item: { findFirst: mocks.findFirst } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "i1" }) };

beforeEach(() => mocks.findFirst.mockReset());

describe("GET /items/:id", () => {
  it("returns the active item DTO", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
      description: null, imageUrl: null, priceAmount: { toString: () => "1", toFixed: () => "1.0000000" },
      priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: null,
      metadata: {}, isActive: true, isListed: true, syncedAt: null,
    });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.externalId).toBe("sword_skin_01");
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "i1", isActive: true, isListed: true } });
  });
  it("404s for an unknown or inactive item", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
