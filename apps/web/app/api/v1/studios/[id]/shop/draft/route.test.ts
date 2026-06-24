import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  scopeToStudio: mocks.scopeToStudio,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { shop: { update: mocks.update } } };
});

import { PUT } from "./route";

const uuid = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: "stu-1" }) };

function req(body: unknown) {
  return new Request("http://x/api/v1/studios/stu-1/shop/draft", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu-1" });
  mocks.scopeToStudio.mockReset();
  mocks.update.mockReset().mockResolvedValue({
    id: "shop-1", studioId: "stu-1", status: "DRAFT",
    layout: { mode: "grid", sections: [] }, draftLayout: null,
    theme: {}, featuredItemIds: [], publishedAt: null, studio: { slug: "gridlock" },
  });
});

describe("PUT /studios/:id/shop/draft", () => {
  const valid = {
    layout: { mode: "grid", sections: [{ id: "s", title: "ALL", itemIds: [uuid] }] },
    theme: { primary: "#c3f400" },
    featuredItemIds: [uuid],
  };

  it("saves draftLayout and returns 200 with the DTO", async () => {
    mocks.update.mockResolvedValue({
      id: "shop-1", studioId: "stu-1", status: "DRAFT",
      layout: { mode: "grid", sections: [] }, draftLayout: valid.layout,
      theme: valid.theme, featuredItemIds: [uuid], publishedAt: null, studio: { slug: "gridlock" },
    });
    const res = await PUT(req(valid), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shop.draftLayout.mode).toBe("grid");
    expect(json.shop.status).toBe("DRAFT");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studioId: "stu-1" },
        data: { draftLayout: valid.layout, theme: valid.theme, featuredItemIds: [uuid] },
        include: { studio: { select: { slug: true } } },
      }),
    );
    expect(mocks.requireStudio).toHaveBeenCalledWith("stu-1");
  });

  it("returns 400 on invalid layout mode", async () => {
    const res = await PUT(req({ ...valid, layout: { mode: "carousel", sections: [] } }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 403 when scopeToStudio throws", async () => {
    mocks.scopeToStudio.mockImplementation(() => { throw Object.assign(new Error("forbidden"), { status: 403 }); });
    const res = await PUT(req(valid), ctx);
    expect(res.status).toBe(403);
  });
});
