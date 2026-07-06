import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http";

vi.mock("@xgamefi/shared/stellar", () => ({
  buildPaymentXdr: vi.fn(async () => "xdr"),
}));

import { createOrderQuote } from "./checkout-queries";

let STUDIO: string;
let ITEM: string;
let PLAYER: string;

async function wipe() {
  await prisma.order.deleteMany({ where: { idempotencyKey: { startsWith: "quote:" } } });
  await prisma.item.deleteMany({ where: { id: ITEM } });
  await prisma.studio.deleteMany({ where: { id: STUDIO } });
  await prisma.player.deleteMany({ where: { id: PLAYER } });
}

beforeEach(async () => {
  STUDIO = randomUUID();
  ITEM = randomUUID();
  PLAYER = randomUUID();
  await prisma.studio.create({
    data: { id: STUDIO, name: "G", slug: `g-${STUDIO.slice(0, 8)}`, payoutWalletAddress: "GDEST", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
  });
  await prisma.item.create({
    data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true, isListed: true },
  });
  await prisma.player.create({ data: { id: PLAYER, walletAddress: `G${PLAYER.replace(/-/g, "").slice(0, 20)}` } });
});

afterEach(wipe);

async function expectHttpError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toSatisfy((err: HttpError) => err.status === status && err.message === code);
}

describe("createOrderQuote", () => {
  it("creates a pending order with the Stellar memo bound to the order id", async () => {
    const res = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 });
    expect(res.order.id).toBeTruthy();
    expect(res.quote.memo).toBe(res.order.id);
    expect(res.quote.destination).toBe(env.STELLAR_RECEIVING_ACCOUNT);
    const persisted = await prisma.order.findUnique({ where: { id: res.order.id } });
    expect(persisted?.paymentStatus).toBe("PENDING");
    expect(persisted?.playerId).toBe(PLAYER);
  });

  it("rejects an inactive studio", async () => {
    await prisma.studio.update({ where: { id: STUDIO }, data: { status: "PENDING" } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 }), 400, "STUDIO_INACTIVE");
  });

  it("rejects an unlisted item", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { isListed: false } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 }), 400, "ITEM_UNAVAILABLE");
  });

  it("rejects an inactive item", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { isActive: false } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 1 }), 400, "ITEM_UNAVAILABLE");
  });

  it("rejects a purchase that exceeds synced stock", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { stock: 3 } });
    await expectHttpError(createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 5 }), 400, "INSUFFICIENT_STOCK");
  });

  it("allows a purchase within synced stock", async () => {
    await prisma.item.update({ where: { id: ITEM }, data: { stock: 5 } });
    const res = await createOrderQuote({ playerId: PLAYER, itemId: ITEM, quantity: 5 });
    expect(res.order.quantity).toBe(5);
  });
});
