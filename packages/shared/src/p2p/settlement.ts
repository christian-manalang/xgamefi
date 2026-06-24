import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyPayment, sendPayment, type Asset } from "../stellar";
import { getQueue } from "../queues";
import { safeFetch } from "../ssrf";
import { signWebhook } from "../hmac";

export type P2PVerifyResult =
  | { status: "PAID" }
  | { status: "ALREADY" }
  | { status: "REJECTED"; reason: string };

function tradeAsset(currency: "XLM" | "USDT"): Asset {
  return currency === "XLM"
    ? { code: "XLM" }
    : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };
}

export async function verifyAndAdvanceP2PTrade(args: {
  tradeId: string;
  txHash: string;
}): Promise<P2PVerifyResult> {
  return prisma.$transaction(async (tx) => {
    const trade = await tx.p2PTrade.findUnique({
      where: { id: args.tradeId },
      include: { listing: true },
    });
    if (!trade) throw new Error(`verifyAndAdvanceP2PTrade: trade ${args.tradeId} not found`);
    if (trade.status !== "ESCROW_PENDING") return { status: "ALREADY" };

    const asset = tradeAsset(trade.currency);
    const verify = await verifyPayment({
      txHash: args.txHash,
      expectedDestination: env.STELLAR_RECEIVING_ACCOUNT,
      expectedAsset: asset,
      minAmount: trade.price,
      expectedMemo: trade.id,
    });
    if (!verify.ok) return { status: "REJECTED", reason: verify.reason };

    // escrowTxHash is not a DB unique, so guard replay with findFirst across other trades.
    const existing = await tx.p2PTrade.findFirst({ where: { escrowTxHash: args.txHash } });
    if (existing && existing.id !== trade.id) {
      return { status: "REJECTED", reason: "escrow txHash already used" };
    }

    await tx.p2PTrade.update({
      where: { id: trade.id },
      data: { status: "PAID", escrowTxHash: args.txHash },
    });

    await tx.ledgerEntry.create({
      data: {
        type: "P2P_ESCROW_IN",
        tradeId: trade.id,
        stellarTxHash: args.txHash,
        sourceAddress: "",
        destAddress: env.STELLAR_RECEIVING_ACCOUNT,
        amount: trade.price,
        assetCode: asset.code,
        assetIssuer: "issuer" in asset ? asset.issuer : null,
        status: "CONFIRMED",
      },
    });

    // Enqueue the item-transfer phase (idempotent by jobId).
    await getQueue("p2p-settlement").add(
      "p2p-settlement",
      { tradeId: trade.id, phase: "transfer" },
      { jobId: `p2p-transfer-${trade.id}` },
    );
    return { status: "PAID" };
  });
}

export async function transferItemAndPayout(args: {
  tradeId: string;
}): Promise<{ status: "COMPLETED" | "FAILED"; reason?: string }> {
  const trade = await prisma.p2PTrade.findUnique({
    where: { id: args.tradeId },
    include: { listing: { include: { seller: true, item: { include: { studio: true } } } }, buyer: true },
  });
  if (!trade) throw new Error(`transferItemAndPayout: trade ${args.tradeId} not found`);
  if (trade.status !== "PAID") throw new Error(`transferItemAndPayout: trade ${args.tradeId} is not PAID`);

  const studio = trade.listing.item.studio;
  if (!studio?.apiBaseUrl) throw new Error(`transferItemAndPayout: studio ${trade.listing.studioId} has no apiBaseUrl`);

  // Call the game transfer API (HMAC-signed, SSRF-guarded).
  const transferUrl = `${studio.apiBaseUrl.replace(/\/+$/, "")}/players/${encodeURIComponent(trade.buyerPlayerId)}/inventory`;
  const payload = { fromPlayerId: trade.sellerPlayerId, itemId: trade.listing.itemId, quantity: 1, tradeId: trade.id };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(studio.webhookSecretHash ?? "", timestamp, rawBody);

  let transferred = false;
  try {
    const res = await safeFetch(transferUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XGameFi-Signature": signature,
        "X-XGameFi-Timestamp": String(timestamp),
      },
      body: rawBody,
      timeoutMs: 15_000,
      maxBytes: 1_000_000,
    });
    if (res.ok) transferred = true;
  } catch (err) {
    console.error(`p2p-settlement: transfer API error for trade ${trade.id}`, err);
  }

  if (!transferred) {
    await getQueue("refund").add("refund", { tradeId: trade.id, kind: "p2p" }, { jobId: `refund-${trade.id}` });
    return { status: "FAILED", reason: "item transfer failed" };
  }

  // Payout the seller their net amount.
  const asset = tradeAsset(trade.currency);
  const sellerAddress = trade.listing.seller.walletAddress;
  if (!sellerAddress) throw new Error(`transferItemAndPayout: seller ${trade.sellerPlayerId} has no wallet address`);

  const { txHash: payoutTxHash } = await sendPayment({
    destination: sellerAddress,
    asset,
    amount: trade.netToSellerAmount.toFixed(7),
    memo: `p2p-payout:${trade.id}`,
  });

  await prisma.$transaction([
    prisma.ledgerEntry.create({
      data: {
        type: "P2P_PAYOUT",
        tradeId: trade.id,
        stellarTxHash: payoutTxHash,
        sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
        destAddress: sellerAddress,
        amount: trade.netToSellerAmount,
        assetCode: asset.code,
        assetIssuer: "issuer" in asset ? asset.issuer : null,
        status: "CONFIRMED",
      },
    }),
    prisma.p2PTrade.update({
      where: { id: trade.id },
      data: { status: "COMPLETED", payoutTxHash, completedAt: new Date() },
    }),
    prisma.p2PListing.update({
      where: { id: trade.listingId },
      data: { status: "SOLD" },
    }),
    prisma.itemOwnership.updateMany({
      where: { playerId: trade.sellerPlayerId, itemId: trade.listing.itemId, lockedForListingId: trade.listingId },
      data: { quantity: { decrement: 1 }, lockedForListingId: null },
    }),
    prisma.itemOwnership.upsert({
      where: { playerId_itemId: { playerId: trade.buyerPlayerId, itemId: trade.listing.itemId } },
      create: { playerId: trade.buyerPlayerId, itemId: trade.listing.itemId, studioId: trade.listing.studioId, quantity: 1, source: "P2P" },
      update: { quantity: { increment: 1 } },
    }),
  ]);

  await getQueue("webhook-delivery").add(
    "webhook-delivery",
    { tradeId: trade.id, event: "p2p_trade_completed" },
    { jobId: `webhook-p2p-${trade.id}` },
  );

  return { status: "COMPLETED" };
}
