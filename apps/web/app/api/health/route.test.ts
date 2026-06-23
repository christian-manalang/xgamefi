import { describe, it, expect, vi } from "vitest";

vi.mock("@xgamefi/db", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } }));
vi.mock("../../../lib/redis", () => ({ pingRedis: vi.fn().mockResolvedValue(true) }));

describe("/api/health", () => {
  it("returns 200 ok for liveness", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("/api/ready", () => {
  it("returns 200 with db+redis healthy", async () => {
    const { GET } = await import("../ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ db: "ok", redis: "ok" });
  });
});
