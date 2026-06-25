import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireRole, updatePlatformSettings, getPlatformSettings, writeAudit } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  updatePlatformSettings: vi.fn(),
  getPlatformSettings: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, updatePlatformSettings, getPlatformSettings, writeAudit };
});

import { PATCH } from "../settings/route";
import { HttpError } from "@/lib/http";

function patchReq(body: unknown) {
  return new Request("http://x/api/v1/admin/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /admin/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin with 403", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await PATCH(patchReq({ defaultFeeBps: 600 }));
    expect(res.status).toBe(403);
    expect(updatePlatformSettings).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range fee with 400", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    const res = await PATCH(patchReq({ defaultFeeBps: 99999 }));
    expect(res.status).toBe(400);
    expect(updatePlatformSettings).not.toHaveBeenCalled();
  });

  it("updates settings and writes an audit log entry", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    updatePlatformSettings.mockResolvedValueOnce({
      id: "singleton",
      defaultFeeBps: 600,
      receivingAccount: "G" + "A".repeat(55),
      payoutSignerPublic: null,
      usdAssetCode: "USDT",
      usdAssetIssuer: null,
      network: "testnet",
      updatedAt: new Date(0),
    });
    const res = await PATCH(patchReq({ defaultFeeBps: 600 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.defaultFeeBps).toBe(600);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform.settings.update",
        actorUserId: "u1",
      }),
    );
  });
});
