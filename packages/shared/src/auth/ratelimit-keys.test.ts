import { describe, it, expect } from "vitest";
import { rlKey, loginFailKey, backoffDelaySec } from "./ratelimit-keys";

describe("rate-limit keys & backoff", () => {
  it("builds deterministic namespaced keys", () => {
    expect(rlKey("auth:login", "1.2.3.4")).toBe("rl:auth:login:1.2.3.4");
  });

  it("login fail key lowercases the username", () => {
    expect(loginFailKey("Admin")).toBe("login:fail:admin");
  });

  it("no backoff for the first 3 failures, then exponential, capped at 900s", () => {
    expect(backoffDelaySec(0)).toBe(0);
    expect(backoffDelaySec(3)).toBe(0);
    expect(backoffDelaySec(4)).toBe(2);
    expect(backoffDelaySec(5)).toBe(4);
    expect(backoffDelaySec(6)).toBe(8);
    expect(backoffDelaySec(100)).toBe(900);
  });
});
