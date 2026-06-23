import { describe, it, expect } from "vitest";
import { signWebhook, verifyHmac } from "./hmac";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ event: "purchase.completed", id: "evt_1" });

describe("hmac", () => {
  it("signWebhook produces the t=<unix>,v1=<hex> format", () => {
    const header = signWebhook(SECRET, 1_700_000_000, BODY);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
  });

  it("verifyHmac accepts a freshly signed header within tolerance", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signWebhook(SECRET, now, BODY);
    expect(verifyHmac({ secret: SECRET, header, rawBody: BODY, toleranceSec: 300 })).toBe(true);
  });

  it("verifyHmac rejects a tampered body", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signWebhook(SECRET, now, BODY);
    expect(verifyHmac({ secret: SECRET, header, rawBody: BODY + "x", toleranceSec: 300 })).toBe(false);
  });

  it("verifyHmac rejects a wrong secret", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signWebhook(SECRET, now, BODY);
    expect(verifyHmac({ secret: "other", header, rawBody: BODY, toleranceSec: 300 })).toBe(false);
  });

  it("verifyHmac rejects a stale timestamp beyond tolerance", () => {
    const stale = Math.floor(Date.now() / 1000) - 1000;
    const header = signWebhook(SECRET, stale, BODY);
    expect(verifyHmac({ secret: SECRET, header, rawBody: BODY, toleranceSec: 300 })).toBe(false);
  });

  it("verifyHmac rejects a malformed header", () => {
    expect(verifyHmac({ secret: SECRET, header: "garbage", rawBody: BODY, toleranceSec: 300 })).toBe(false);
  });
});
