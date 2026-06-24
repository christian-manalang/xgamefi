import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
  add: vi.fn(),
}));
const getQueue = vi.hoisted(() => vi.fn(() => ({ add: mocks.add })));

vi.mock("../../../../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  scopeToStudio: mocks.scopeToStudio,
}));
vi.mock("@xgamefi/shared/queues", () => ({ getQueue }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "stu1" }) };

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.scopeToStudio.mockReset();
  mocks.add.mockReset();
});

describe("POST /studios/:id/items/sync", () => {
  it("enqueues catalogue-sync and returns 202", async () => {
    const res = await POST(new Request("https://x", { method: "POST" }), ctx);
    expect(res.status).toBe(202);
    expect(getQueue).toHaveBeenCalledWith("catalogue-sync");
    expect(mocks.add).toHaveBeenCalledWith("catalogue-sync", { studioId: "stu1" });
  });
});
