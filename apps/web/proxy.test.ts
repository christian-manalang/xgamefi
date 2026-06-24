import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";

function req(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(`http://localhost:3000${path}`), { headers });
}

describe("proxy coarse auth gate", () => {
  it("redirects an unauthenticated /dashboard request to /login", () => {
    const res = proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets a cookie-bearing request through to /dashboard (coarse only)", () => {
    const res = proxy(req("/dashboard", "xgf_session=abc"));
    expect(res.status).toBe(200);
  });

  it("does not gate public storefront routes", () => {
    const res = proxy(req("/s/gridlock"));
    expect(res.status).toBe(200);
  });

  it("sets security headers", () => {
    const res = proxy(req("/s/gridlock"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBeTruthy();
  });
});
