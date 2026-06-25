// COARSE auth gate ONLY. This is defense-in-depth, NOT the authoritative check.
// Every route handler / Server Action MUST independently re-verify authZ via
// lib/auth/guards (Next has shipped middleware/proxy bypass CVEs — never trust this alone).
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/session";

export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

const PROTECTED_PREFIXES = ["/admin", "/dashboard"];

export default function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(securityHeaders())) {
    res.headers.set(k, v);
  }
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/api/:path*"],
};
