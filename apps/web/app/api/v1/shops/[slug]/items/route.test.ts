import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopItems: vi.fn(),
}));

vi.mock("../../../../../../lib/catalogue-queries", () => ({ getShopItems: mocks.getShopItems }));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ slug: "gridlock" }) };

beforeEach(() => mocks.getShopItems.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24 }));

describe("GET /shops/:slug/items", () => {
  it("parses query params and delegates to getShopItems", async () => {
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/items?q=sword&page=2"), ctx);
    expect(res.status).toBe(200);
    expect(mocks.getShopItems).toHaveBeenCalledWith("gridlock", expect.objectContaining({ q: "sword", page: 2, pageSize: 24 }));
  });
  it("400s on an invalid pageSize", async () => {
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/items?pageSize=999"), ctx);
    expect(res.status).toBe(400);
  });
});
