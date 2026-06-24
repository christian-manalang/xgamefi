// COARSE auth gate ONLY. This is defense-in-depth, NOT the authoritative check.
// Every route handler / Server Action MUST independently re-verify authZ via
// lib/auth/guards (Next has shipped middleware/proxy bypass CVEs — never trust this alone).
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/session";

const PROTECTED_PREFIXES = ["/admin", "/dashboard"];

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'; default-src 'self'");
  return res;
}

export default function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
