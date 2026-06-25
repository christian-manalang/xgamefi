import { describe, it, expect } from "vitest";
import { securityHeaders } from "../proxy";

describe("security headers", () => {
  it("sets CSP, HSTS, nosniff, referrer policy, frame-ancestors none", () => {
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
