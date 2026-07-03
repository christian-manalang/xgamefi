import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  fetchRemoteItems: vi.fn(),
  upsertCatalogueItems: vi.fn(),
}));

vi.mock("@xgamefi/db", () => ({
  prisma: {
    studio: { findUnique: mocks.findUnique },
    item: { findMany: mocks.findMany },
    shop: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));
vi.mock("@xgamefi/shared", () => ({ fetchRemoteItems: mocks.fetchRemoteItems, upsertCatalogueItems: mocks.upsertCatalogueItems }));

import { catalogueSyncProcessor } from "./catalogue-sync";

beforeEach(() => {
  mocks.findUnique.mockReset();
  mocks.findMany.mockReset();
  mocks.update.mockReset();
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
    mocks.findMany.mockResolvedValue([{ id: "11111111-1111-1111-1111-111111111111" }]);

    const res = await catalogueSyncProcessor({ data: { studioId: "stu1" } });

    expect(mocks.fetchRemoteItems).toHaveBeenCalledWith("https://api.gridlock.gg");
    expect(mocks.upsertCatalogueItems).toHaveBeenCalledWith("stu1", [
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1", currency: "USDT" },
    ]);
    expect(res).toEqual({ upserted: 1, deactivated: 0, shopUpdated: false });
  });

  it("appends new active items to the shop layout", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({
        id: "stu1", integrationMode: "API_PULL", apiBaseUrl: "https://api.gridlock.gg",
      })
      .mockResolvedValueOnce({
        studioId: "stu1",
        layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: ["11111111-1111-1111-1111-111111111111"] }] },
        draftLayout: null,
      });
    mocks.fetchRemoteItems.mockResolvedValue([
      { externalId: "new_item", name: "New Item", price: "2", currency: "USDT" },
    ]);
    mocks.upsertCatalogueItems.mockResolvedValue({ upserted: 1, deactivated: 0 });
    mocks.findMany.mockResolvedValue([{ id: "11111111-1111-1111-1111-111111111111" }, { id: "22222222-2222-2222-2222-222222222222" }]);

    const res = await catalogueSyncProcessor({ data: { studioId: "stu1" } });

    expect(res).toEqual({ upserted: 1, deactivated: 0, shopUpdated: true });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { studioId: "stu1" },
      data: {
        layout: {
          mode: "grid",
          sections: [{ id: "all", title: "ALL", itemIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"] }],
        },
      },
    });
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
