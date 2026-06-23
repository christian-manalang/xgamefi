import { describe, it, expect, beforeEach } from "vitest";
import { redis } from "./redis";
import { rateLimit, registerLoginFailure, clearLoginFailures, loginBackoffActive } from "./ratelimit";

describe("redis rate-limit + login backoff", () => {
  beforeEach(async () => { await redis.flushdb(); });

  it("allows up to the limit then blocks within the window", async () => {
    const args = { scope: "test:auth", identifier: "ip-1", limit: 2, windowSec: 60 };
    expect((await rateLimit(args)).allowed).toBe(true);
    expect((await rateLimit(args)).allowed).toBe(true);
    expect((await rateLimit(args)).allowed).toBe(false);
  });

  it("tracks login failures and engages backoff after 3", async () => {
    expect(await loginBackoffActive("admin")).toBe(false);
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    expect(await registerLoginFailure("admin")).toBe(4); // 4th failure
    expect(await loginBackoffActive("admin")).toBe(true);
  });

  it("clears failures on success", async () => {
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await registerLoginFailure("admin");
    await clearLoginFailures("admin");
    expect(await loginBackoffActive("admin")).toBe(false);
  });
});
