import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../../../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  scopeToStudio: mocks.scopeToStudio,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { item: { findMany: mocks.findMany } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "stu1" }) };

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.scopeToStudio.mockReset();
  mocks.findMany.mockReset();
});

describe("GET /studios/:id/items", () => {
  it("returns studio-scoped item DTOs", async () => {
    mocks.findMany.mockResolvedValue([{
      id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
      description: null, imageUrl: null, priceAmount: { toString: () => "1", toFixed: () => "1.0000000" },
      priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: null,
      metadata: {}, isActive: true, syncedAt: null,
    }]);
    const res = await GET(new Request("https://x/api"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    const first = body.items[0];
    expect(first).toBeDefined();
    expect(first.externalId).toBe("sword_skin_01");
    expect(first.priceAmount).toBeUndefined();
    expect(mocks.scopeToStudio).toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { studioId: "stu1" } }));
  });
});
