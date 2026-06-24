import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { shop: { findFirst: mocks.findFirst } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ slug: "gridlock" }) };

beforeEach(() => mocks.findFirst.mockReset());

describe("GET /shops/:slug", () => {
  it("returns the published shop DTO", async () => {
    mocks.findFirst.mockResolvedValue({
      studioId: "stu1", status: "PUBLISHED",
      layout: { mode: "grid", sections: [] }, theme: { primaryFixed: "#c3f400" },
      featuredItemIds: ["i1"], publishedAt: new Date("2026-06-23T12:00:00.000Z"),
      studio: { slug: "gridlock" },
    });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).shop.slug).toBe("gridlock");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { studio: { slug: "gridlock" }, status: "PUBLISHED" },
      include: { studio: { select: { slug: true } } },
    });
  });
  it("404s when there is no published shop for the slug", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
