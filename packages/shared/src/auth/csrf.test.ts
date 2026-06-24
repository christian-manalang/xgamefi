import { describe, it, expect } from "vitest";
import { isSameOrigin, issueCsrfToken, verifyCsrfToken } from "./csrf";

const SECRET = "x".repeat(32);

describe("csrf", () => {
  it("isSameOrigin matches scheme+host+port exactly", () => {
    expect(isSameOrigin("http://localhost:3000", "http://localhost:3000")).toBe(true);
    expect(isSameOrigin("http://localhost:3000/x", "http://localhost:3000")).toBe(true); // referer path ignored
    expect(isSameOrigin("https://evil.com", "http://localhost:3000")).toBe(false);
    expect(isSameOrigin(null, "http://localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3001", "http://localhost:3000")).toBe(false);
  });

  it("issued token verifies against its own session", async () => {
    const t = await issueCsrfToken(SECRET, "sess-1");
    expect(await verifyCsrfToken(SECRET, t, "sess-1")).toBe(true);
  });

  it("rejects a token bound to a different session", async () => {
    const t = await issueCsrfToken(SECRET, "sess-1");
    expect(await verifyCsrfToken(SECRET, t, "sess-2")).toBe(false);
  });

  it("rejects a tampered/garbage token without throwing", async () => {
    expect(await verifyCsrfToken(SECRET, "garbage", "sess-1")).toBe(false);
  });
});
