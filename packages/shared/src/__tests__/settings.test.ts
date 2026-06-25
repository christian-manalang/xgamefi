import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { getPlatformSettings, updatePlatformSettings } from "../settings";

describe("platform settings", () => {
  beforeEach(async () => {
    await prisma.platformSetting.deleteMany();
  });

  it("bootstraps a singleton from env defaults when none exists", async () => {
    const s = await getPlatformSettings();
    expect(s.id).toBe("singleton");
    expect(s.defaultFeeBps).toBeTypeOf("number");
    expect(s.network).toMatch(/testnet|pubnet/);
  });

  it("updates only provided fields and bumps updatedAt", async () => {
    const before = await getPlatformSettings();
    const after = await updatePlatformSettings({ defaultFeeBps: 750 });
    expect(after.defaultFeeBps).toBe(750);
    expect(after.receivingAccount).toBe(before.receivingAccount);
  });
});
