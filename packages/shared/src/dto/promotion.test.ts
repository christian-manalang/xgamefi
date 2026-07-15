import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toPromotionDto } from "./promotion";

describe("toPromotionDto", () => {
  it("maps a promotion row to a DTO with 7dp string value and no internal fields", () => {
    const dto = toPromotionDto({
      id: "p1", studioId: "s1", name: "Launch 10%", code: null, type: "PERCENT",
      value: new Prisma.Decimal("10"), currency: null, appliesToItemIds: ["i1"],
      bundleConfig: null, startsAt: null, endsAt: null,
      usageLimit: 100, usageCount: 3, isActive: true,
      createdAt: new Date("2026-06-23T00:00:00Z"), updatedAt: new Date("2026-06-23T00:00:00Z"),
    });
    expect(dto).toEqual({
      id: "p1", name: "Launch 10%", code: null, type: "PERCENT", value: "10.0000000",
      currency: null, appliesToItemIds: ["i1"], bundleConfig: null,
      startsAt: null, endsAt: null, usageLimit: 100, usageCount: 3, isActive: true,
      createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z",
    });
    expect("studioId" in dto).toBe(false);
  });
});
