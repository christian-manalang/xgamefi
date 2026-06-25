import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RATE_LIMITED_PATHS } from "../rateLimit";

// Each listed path must have a route handler that imports the rateLimit helper.
const ROUTE_OF: Record<string, string> = {
  "/api/v1/auth/login": "app/api/v1/auth/login/route.ts",
  "/api/v1/auth/wallet/challenge": "app/api/v1/auth/wallet/challenge/route.ts",
  "/api/v1/auth/wallet/verify": "app/api/v1/auth/wallet/verify/route.ts",
  "/api/v1/checkout/quote": "app/api/v1/checkout/quote/route.ts",
  "/api/v1/checkout/submit": "app/api/v1/checkout/submit/route.ts",
  "/api/v1/p2p/listings": "app/api/v1/p2p/listings/route.ts",
};

describe("rate-limit coverage", () => {
  it("lists exactly the auth/checkout/listing paths", () => {
    expect(new Set(RATE_LIMITED_PATHS)).toEqual(new Set(Object.keys(ROUTE_OF)));
  });

  it("each rate-limited route imports the rateLimit helper", () => {
    const webRoot = join(__dirname, "..", "..");
    for (const [, rel] of Object.entries(ROUTE_OF)) {
      const file = join(webRoot, rel);
      expect(existsSync(file), `${rel} missing`).toBe(true);
      expect(readFileSync(file, "utf8")).toContain("rateLimit");
    }
  });
});
