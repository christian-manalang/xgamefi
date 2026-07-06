// COARSE auth gate + hostname-based routing.
// This is defense-in-depth, NOT the authoritative check.
// Every route handler / Server Action MUST independently re-verify authZ via
// lib/auth/guards (Next has shipped middleware/proxy bypass CVEs — never trust this alone).
import { NextRequest, NextResponse } from "next/server";
import proxy from "./proxy";

// Hostnames that serve only the public landing page (root route /).
const LANDING_HOSTS = new Set(["xgamefi.shop", "xgamefi-staging.up.railway.app"]);

// Hostnames that serve the full operator app (login, dashboard, admin, storefront).
const APP_HOSTS = new Set(["app.xgamefi.shop", "app-staging.up.railway.app"]);

export default function middleware(req: NextRequest): NextResponse {
  const { hostname, pathname } = req.nextUrl;

  // ── Landing domain ────────────────────────────────────────────────────────
  // Rewrite every path to / so only the landing page is rendered.
  // Static assets (_next/*) are excluded by the matcher below.
  if (LANDING_HOSTS.has(hostname)) {
    if (pathname !== "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.rewrite(url);
    }
    // Already at /; let Next render the landing page normally.
    return NextResponse.next();
  }

  // ── App domain ────────────────────────────────────────────────────────────
  // Redirect bare / to /login so users land on the auth flow.
  // The proxy() call below then enforces the session gate on protected routes.
  if (APP_HOSTS.has(hostname)) {
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return proxy(req);
  }

  // ── All other hostnames (local dev, preview, etc.) ────────────────────────
  // Fall through to the standard auth gate without hostname restrictions.
  return proxy(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
