import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireStudio } = vi.hoisted(() => ({
  requireStudio: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireStudio }));

const { apiKeyCreate, apiKeyFindFirst, apiKeyUpdate } = vi.hoisted(() => ({
  apiKeyCreate: vi.fn(),
  apiKeyFindFirst: vi.fn(),
  apiKeyUpdate: vi.fn(),
}));

vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    prisma: {
      apiKey: {
        create: apiKeyCreate,
        findFirst: apiKeyFindFirst,
        update: apiKeyUpdate,
      },
    },
  };
});

const { writeAudit } = vi.hoisted(() => ({
  writeAudit: vi.fn(),
}));

vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, writeAudit };
});

import { POST as issueKey } from "../[id]/api-keys/route";
import { DELETE as revokeKey } from "../[id]/api-keys/[keyId]/route";

describe("api key endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues a key, returns the raw key ONCE, and persists only the hash", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    apiKeyCreate.mockImplementationOnce(async ({ data }: any) => ({
      id: "k1",
      keyPrefix: data.keyPrefix,
      scopes: data.scopes,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(0),
    }));
    const res = await issueKey(
      new Request("http://x/api/v1/studios/s1/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.data.key).toBe("string");
    expect(body.data.key.startsWith("xgk_")).toBe(true);
    const persisted = apiKeyCreate.mock.calls[0]?.[0].data;
    expect(persisted.hashedKey).toBeTypeOf("string");
    expect(persisted.hashedKey).not.toBe(body.data.key);
    expect(persisted).not.toHaveProperty("rawKey");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "apikey.issue" }));
  });

  it("revokes a key belonging to the studio and audits", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    apiKeyFindFirst.mockResolvedValueOnce({ id: "k1", studioId: "s1" });
    apiKeyUpdate.mockResolvedValueOnce({
      id: "k1",
      keyPrefix: "xgk_abc",
      scopes: ["ingest"],
      lastUsedAt: null,
      revokedAt: new Date(0),
      createdAt: new Date(0),
    });
    const res = await revokeKey(
      new Request("http://x/api/v1/studios/s1/api-keys/k1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "s1", keyId: "k1" }) },
    );
    expect(res.status).toBe(200);
    expect(apiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "apikey.revoke" }));
  });

  it("returns 404 revoking a key not in this studio", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    apiKeyFindFirst.mockResolvedValueOnce(null);
    const res = await revokeKey(
      new Request("http://x/api/v1/studios/s1/api-keys/kX", { method: "DELETE" }),
      { params: Promise.resolve({ id: "s1", keyId: "kX" }) },
    );
    expect(res.status).toBe(404);
  });
});
