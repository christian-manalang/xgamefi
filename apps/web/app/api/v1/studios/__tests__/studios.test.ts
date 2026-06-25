import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireRole, requireStudio, scopeToStudio } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireStudio: vi.fn(),
  scopeToStudio: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole, requireStudio, scopeToStudio }));

const { studioCreate, studioFindMany, studioFindUnique, studioUpdate } = vi.hoisted(() => ({
  studioCreate: vi.fn(),
  studioFindMany: vi.fn(),
  studioFindUnique: vi.fn(),
  studioUpdate: vi.fn(),
}));

vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    prisma: {
      studio: {
        create: studioCreate,
        findMany: studioFindMany,
        findUnique: studioFindUnique,
        update: studioUpdate,
      },
    },
  };
});

const { writeAudit, getPlatformSettings, assertPublicUrl } = vi.hoisted(() => ({
  writeAudit: vi.fn(),
  getPlatformSettings: vi.fn().mockResolvedValue({ defaultFeeBps: 500 }),
  assertPublicUrl: vi.fn(),
}));

vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, writeAudit, getPlatformSettings, assertPublicUrl };
});

import { GET as listStudios, POST as onboardStudio } from "../route";
import { PATCH as patchStudio } from "../[id]/route";
import { HttpError } from "@/lib/http";

const studioRow = {
  id: "s1",
  name: "Gridlock",
  slug: "gridlock",
  status: "PENDING",
  platformFeeBps: 500,
  payoutWalletAddress: null,
  integrationMode: "API_PULL",
  webhookUrl: null,
  apiBaseUrl: null,
  createdAt: new Date(0),
};

describe("studios admin endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /studios rejects non-admin", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await listStudios(new Request("http://x/api/v1/studios"));
    expect(res.status).toBe(403);
  });

  it("POST /studios onboards with default fee and audits", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    studioCreate.mockResolvedValueOnce(studioRow);
    const res = await onboardStudio(
      new Request("http://x/api/v1/studios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Gridlock", slug: "gridlock" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(studioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ platformFeeBps: 500, status: "PENDING" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "studio.onboard" }));
  });

  it("PATCH /studios/:id SUSPEND requires ADMIN and audits suspend", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    studioFindUnique.mockResolvedValueOnce(studioRow);
    studioUpdate.mockResolvedValueOnce({ ...studioRow, status: "SUSPENDED" });
    const res = await patchStudio(
      new Request("http://x/api/v1/studios/s1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED" }),
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(200);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "studio.suspend" }));
  });

  it("PATCH /studios/:id rejects a non-admin trying to change platformFeeBps", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u2",
      studioId: "s1",
    });
    studioFindUnique.mockResolvedValueOnce(studioRow);
    const res = await patchStudio(
      new Request("http://x/api/v1/studios/s1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platformFeeBps: 100 }),
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(403);
    expect(studioUpdate).not.toHaveBeenCalled();
  });
});
