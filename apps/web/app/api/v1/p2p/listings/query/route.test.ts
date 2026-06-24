import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, count, shopFindFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  shopFindFirst: vi.fn(),
}));

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { p2PListing: { findMany, count }, shop: { findFirst: shopFindFirst } } };
});

import { GET } from "./route";

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
  shopFindFirst.mockReset().mockResolvedValue({ studioId: "s1" });
});

describe("GET /p2p/listings/query", () => {
  it("requires slug query param", async () => {
    const res = await GET(new Request("https://x"));
    expect(res.status).toBe(400);
  });

  it("returns listings for the shop slug", async () => {
    const res = await GET(new Request("https://x?slug=gridlock"));
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { studioId: "s1", status: "ACTIVE" } }));
  });
});
