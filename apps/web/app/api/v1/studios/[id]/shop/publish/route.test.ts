import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  studioFindUnique: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  scopeToStudio: mocks.scopeToStudio,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: {
    shop: { findUnique: mocks.findUnique, update: mocks.update },
    studio: { findUnique: mocks.studioFindUnique },
  } };
});

import { POST } from "./route";

const uuid = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: "stu-1" }) };
const draft = { mode: "grid", sections: [{ id: "s", title: "ALL", itemIds: [uuid] }] };

function req() {
  return new Request("http://x/api/v1/studios/stu-1/shop/publish", { method: "POST" });
}

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu-1" });
  mocks.scopeToStudio.mockReset();
  mocks.studioFindUnique.mockReset().mockResolvedValue({ status: "ACTIVE" });
  mocks.findUnique.mockReset().mockResolvedValue({ draftLayout: draft });
  mocks.update.mockReset().mockResolvedValue({
    id: "shop-1", studioId: "stu-1", status: "PUBLISHED",
    layout: draft, draftLayout: draft, theme: {}, featuredItemIds: [uuid],
    publishedAt: new Date("2026-06-23T00:00:00Z"), studio: { slug: "gridlock" },
  });
});

describe("POST /studios/:id/shop/publish", () => {
  it("promotes draftLayout to layout and sets PUBLISHED + publishedAt", async () => {
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shop.status).toBe("PUBLISHED");
    expect(json.shop.layout.mode).toBe("grid");
    expect(json.shop.publishedAt).toBe("2026-06-23T00:00:00.000Z");
    const arg = mocks.update.mock.calls[0]![0];
    expect(arg.where).toEqual({ studioId: "stu-1" });
    expect(arg.data.layout).toEqual(draft);
    expect(arg.data.status).toBe("PUBLISHED");
    expect(arg.data.publishedAt).toBeInstanceOf(Date);
  });

  it("returns 409 when there is no draft to publish", async () => {
    mocks.findUnique.mockResolvedValue({ draftLayout: null });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 409 when draftLayout is malformed", async () => {
    mocks.findUnique.mockResolvedValue({ draftLayout: { mode: "carousel" } });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
  });

  it("returns 403 when scopeToStudio throws", async () => {
    mocks.scopeToStudio.mockImplementation(() => { throw Object.assign(new Error("forbidden"), { status: 403 }); });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
  });
});
