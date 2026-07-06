import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toItemDto } from "./item";

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  studioId: "22222222-2222-2222-2222-222222222222",
  externalId: "sword_skin_01",
  name: "Sword Skin",
  description: "A glowing blade",
  imageUrl: "https://cdn.example.com/sword.png",
  priceAmount: new Prisma.Decimal("1"),
  priceCurrency: "USDT" as const,
  stock: null,
  rarity: "LEGENDARY",
  category: "skins",
  metadata: { dmg: 10 },
  isActive: true,
  isListed: true,
  syncedAt: new Date("2026-06-23T12:00:00.000Z"),
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-23T12:00:00.000Z"),
};

describe("toItemDto", () => {
  it("maps a row to a DTO with 7dp price and ISO dates", () => {
    expect(toItemDto(row)).toEqual({
      id: row.id,
      studioId: row.studioId,
      externalId: "sword_skin_01",
      name: "Sword Skin",
      description: "A glowing blade",
      imageUrl: "https://cdn.example.com/sword.png",
      price: { amount: "1.0000000", currency: "USDT" },
      stock: null,
      rarity: "LEGENDARY",
      category: "skins",
      metadata: { dmg: 10 },
      isActive: true,
      isListed: true,
      syncedAt: "2026-06-23T12:00:00.000Z",
    });
  });

  it("never leaks raw row fields (no priceAmount/createdAt)", () => {
    const dto = toItemDto(row) as Record<string, unknown>;
    expect(dto.priceAmount).toBeUndefined();
    expect(dto.createdAt).toBeUndefined();
  });

  it("handles null metadata as empty object and null syncedAt", () => {
    const dto = toItemDto({ ...row, metadata: null, syncedAt: null });
    expect(dto.metadata).toEqual({});
    expect(dto.syncedAt).toBeNull();
  });
});
