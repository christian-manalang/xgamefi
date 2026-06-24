import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  fetchRemoteItems: vi.fn(),
  upsertCatalogueItems: vi.fn(),
}));

vi.mock("@xgamefi/db", () => ({ prisma: { studio: { findUnique: mocks.findUnique } } }));
vi.mock("@xgamefi/shared", () => ({ fetchRemoteItems: mocks.fetchRemoteItems, upsertCatalogueItems: mocks.upsertCatalogueItems }));

import { catalogueSyncProcessor } from "./catalogue-sync";

beforeEach(() => {
  mocks.findUnique.mockReset();
  mocks.fetchRemoteItems.mockReset();
  mocks.upsertCatalogueItems.mockReset();
});

describe("catalogueSyncProcessor", () => {
  it("pulls remote items and upserts them", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "stu1", integrationMode: "API_PULL", apiBaseUrl: "https://api.gridlock.gg",
    });
    mocks.fetchRemoteItems.mockResolvedValue([
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1", currency: "USDT" },
    ]);
    mocks.upsertCatalogueItems.mockResolvedValue({ upserted: 1, deactivated: 0 });

    const res = await catalogueSyncProcessor({ data: { studioId: "stu1" } });

    expect(mocks.fetchRemoteItems).toHaveBeenCalledWith("https://api.gridlock.gg");
    expect(mocks.upsertCatalogueItems).toHaveBeenCalledWith("stu1", [
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1", currency: "USDT" },
    ]);
    expect(res).toEqual({ upserted: 1, deactivated: 0 });
  });

  it("throws when the studio is not in API_PULL mode", async () => {
    mocks.findUnique.mockResolvedValue({ id: "stu1", integrationMode: "WEBHOOK_PUSH", apiBaseUrl: null });
    await expect(catalogueSyncProcessor({ data: { studioId: "stu1" } })).rejects.toThrow(/API_PULL/);
    expect(mocks.fetchRemoteItems).not.toHaveBeenCalled();
  });

  it("throws when apiBaseUrl is missing", async () => {
    mocks.findUnique.mockResolvedValue({ id: "stu1", integrationMode: "API_PULL", apiBaseUrl: null });
    await expect(catalogueSyncProcessor({ data: { studioId: "stu1" } })).rejects.toThrow(/apiBaseUrl/);
  });
});
