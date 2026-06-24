import { describe, it, expect } from "vitest";
import { prisma } from "../../src/index";

describe("Session.playerId migration", () => {
  it("allows creating a player-bound session row", async () => {
    const walletAddress = "G" + "B".repeat(55);
    // Idempotent: clear any leftover from a prior interrupted run.
    const existing = await prisma.player.findUnique({ where: { walletAddress } });
    if (existing) {
      await prisma.session.deleteMany({ where: { playerId: existing.id } });
      await prisma.player.delete({ where: { id: existing.id } });
    }
    const player = await prisma.player.create({ data: { walletAddress } });
    const sess = await prisma.session.create({
      data: { tokenHash: "h-" + Date.now(), userAgent: "t", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 1000), playerId: player.id },
    });
    expect(sess.playerId).toBe(player.id);
    expect(sess.userId).toBeNull();
    await prisma.session.delete({ where: { id: sess.id } });
    await prisma.player.delete({ where: { id: player.id } });
  });
});
