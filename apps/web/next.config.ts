import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Required while the web service runs `next dev` in staging. Without this,
  // the dev server blocks cross-origin requests from the custom domains.
  allowedDevOrigins: [
    "xgamefi.shop",
    "app.xgamefi.shop",
    "xgamefi-staging.up.railway.app",
    "app-staging.up.railway.app",
    "xgamefi-app-staging.up.railway.app",
    "xgamefi-app.up.railway.app",
  ],
  // Workspace packages ship TypeScript source (incl. the Prisma 7 generated
  // client, which uses `.js` specifiers that resolve to `.ts`); transpiling
  // them lets Next's bundler apply the .js→.ts extension alias.
  transpilePackages: ["@xgamefi/db", "@xgamefi/config", "@xgamefi/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
