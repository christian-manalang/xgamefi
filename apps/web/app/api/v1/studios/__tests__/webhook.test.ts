import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireStudio } = vi.hoisted(() => ({
  requireStudio: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireStudio }));

const { studioUpdate } = vi.hoisted(() => ({
  studioUpdate: vi.fn(),
}));

vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { studio: { update: studioUpdate } } };
});

const { assertPublicUrl, writeAudit } = vi.hoisted(() => ({
  assertPublicUrl: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, assertPublicUrl, writeAudit };
});

import { PATCH as setWebhook } from "../[id]/webhook/route";

function req(body: unknown) {
  return new Request("http://x/api/v1/studios/s1/webhook", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /studios/:id/webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an SSRF-failing URL with 400 and does not persist", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    assertPublicUrl.mockRejectedValueOnce(new Error("blocked: private/metadata range"));
    const res = await setWebhook(req({ url: "https://169.254.169.254/" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(400);
    expect(studioUpdate).not.toHaveBeenCalled();
  });

  it("sets a validated URL, rotates the secret, returns it once, stores only the hash", async () => {
    requireStudio.mockResolvedValueOnce({
      kind: "user",
      role: "STUDIO_OWNER",
      userId: "u1",
      studioId: "s1",
    });
    assertPublicUrl.mockResolvedValueOnce(new URL("https://hooks.gridlock.gg/x"));
    studioUpdate.mockImplementationOnce(async ({ data }: any) => ({
      id: "s1",
      webhookUrl: data.webhookUrl,
      webhookSecretHash: data.webhookSecretHash,
    }));
    const res = await setWebhook(req({ url: "https://hooks.gridlock.gg/x" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.webhookUrl).toBe("https://hooks.gridlock.gg/x");
    expect(typeof body.data.secret).toBe("string");
    expect(body.data.secret.startsWith("whsec_")).toBe(true);
    const persisted = studioUpdate.mock.calls[0][0].data;
    expect(persisted.webhookSecretHash).not.toBe(body.data.secret);
    expect(persisted).not.toHaveProperty("webhookSecret");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "webhook.config" }));
  });
});
