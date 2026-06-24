import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("../../../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  scopeToStudio: mocks.scopeToStudio,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { shop: { findFirst: mocks.findFirst } } };
});

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "stu1" }) };

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.scopeToStudio.mockReset();
  mocks.findFirst.mockReset();
});

describe("GET /studios/:id/shop", () => {
  it("returns the studio's shop config (any status)", async () => {
    mocks.findFirst.mockResolvedValue({
      studioId: "stu1", status: "DRAFT", layout: { mode: "grid", sections: [] },
      theme: {}, featuredItemIds: [], publishedAt: null, studio: { slug: "gridlock" },
    });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).shop.status).toBe("DRAFT");
    expect(mocks.scopeToStudio).toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { studioId: "stu1" },
      include: { studio: { select: { slug: true } } },
    });
  });
  it("404s when the studio has no shop", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
