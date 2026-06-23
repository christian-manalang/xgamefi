import { describe, it, expect } from "vitest";
import { generateSessionId, hashToken, safeEqual } from "./tokens";

describe("session tokens", () => {
  it("generates unique high-entropy ids", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url, no padding
  });

  it("hashes deterministically to 64 hex chars", () => {
    expect(hashToken("abc")).toEqual(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toEqual(hashToken("abd"));
  });

  it("safeEqual is true only for identical strings", () => {
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "tokeN")).toBe(false);
    expect(safeEqual("token", "tok")).toBe(false);
  });
});
