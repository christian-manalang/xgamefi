import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { signWebhook } from "@xgamefi/shared/hmac";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("@xgamefi/db", () => ({ prisma: { apiKey: { findFirst: mocks.findFirst } } }));
vi.mock("@xgamefi/config/env", () => ({ env: { WEBHOOK_TIMESTAMP_TOLERANCE_SEC: 300 } }));

import { authenticateIngest, IngestAuthError } from "./ingest-auth";

const RAW_KEY = "xgk_test_secret_key";
const hashed = createHash("sha256").update(RAW_KEY).digest("hex");

beforeEach(() => mocks.findFirst.mockReset());

function headersFor(rawBody: string, key = RAW_KEY, secret = RAW_KEY) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signWebhook(secret, ts, ts + "." + rawBody);
  return new Headers({
    "x-xgamefi-key": key,
    "x-xgamefi-timestamp": String(ts),
    "x-xgamefi-signature": sig,
  });
}

describe("authenticateIngest", () => {
  it("returns studioId for a valid key + signature", async () => {
    mocks.findFirst.mockResolvedValue({ id: "key1", studioId: "stu1", hashedKey: hashed, revokedAt: null });
    const body = JSON.stringify([{ externalId: "a" }]);
    const res = await authenticateIngest(headersFor(body), body);
    expect(res).toEqual({ studioId: "stu1", apiKeyId: "key1" });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { hashedKey: hashed, revokedAt: null } });
  });

  it("throws 401 for an unknown key", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const body = "[]";
    await expect(authenticateIngest(headersFor(body), body)).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 for a tampered body (bad signature)", async () => {
    mocks.findFirst.mockResolvedValue({ id: "key1", studioId: "stu1", hashedKey: hashed, revokedAt: null });
    const headers = headersFor("[]");
    await expect(authenticateIngest(headers, '[{"externalId":"evil"}]')).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when the key header is missing", async () => {
    await expect(authenticateIngest(new Headers(), "[]")).rejects.toBeInstanceOf(IngestAuthError);
  });
});
