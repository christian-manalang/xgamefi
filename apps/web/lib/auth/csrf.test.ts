import { describe, it, expect, vi } from "vitest";

vi.mock("@xgamefi/config/env", () => ({ env: { APP_BASE_URL: "http://localhost:3000", NODE_ENV: "test" } }));

import { assertCsrf } from "./csrf";
import { AuthError } from "./guards";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/v1/auth/logout", { method: "POST", headers });
}

describe("assertCsrf", () => {
  it("passes when Origin is same-origin", () => {
    expect(() => assertCsrf(req({ origin: "http://localhost:3000" }))).not.toThrow();
  });
  it("passes when Referer is same-origin (no Origin)", () => {
    expect(() => assertCsrf(req({ referer: "http://localhost:3000/login" }))).not.toThrow();
  });
  it("throws 403 CSRF on cross-origin Origin", () => {
    try { assertCsrf(req({ origin: "https://evil.com" })); expect.fail(); }
    catch (e) { expect(e).toBeInstanceOf(AuthError); expect((e as AuthError).status).toBe(403); }
  });
  it("throws 403 when neither Origin nor Referer is present", () => {
    expect(() => assertCsrf(req({}))).toThrow(AuthError);
  });
});
