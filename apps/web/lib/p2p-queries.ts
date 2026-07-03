import { prisma, Prisma } from "@xgamefi/db";
import { assertOwnsItem } from "@xgamefi/shared/p2p/ownership";
import { toP2PListingDto, toP2PTradeDto, type P2PListingDto, type P2PTradeDto, type P2PListingStatus, type P2PTradeStatus } from "@xgamefi/shared/dto";
import { feeAmount, netAmount, toStellarAmount } from "@xgamefi/shared/money";
import { buildPaymentXdr, type Asset } from "@xgamefi/shared/stellar";
import { env } from "@xgamefi/config/env";

export async function createListing(input: {
  sellerPlayerId: string;
  itemId: string;
  price: string;
  currency: "XLM" | "USDT";
}): Promise<P2PListingDto> {
  const item = await prisma.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error("item not found");

  await assertOwnsItem({ studioId: item.studioId, playerId: input.sellerPlayerId, itemId: item.id });

  const listing = await prisma.p2PListing.create({
    data: {
      studioId: item.studioId,
      itemId: item.id,
      sellerPlayerId: input.sellerPlayerId,
      price: new Prisma.Decimal(input.price),
      currency: input.currency,
      status: "ACTIVE",
    },
  });

  await prisma.itemOwnership.upsert({
    where: { playerId_itemId: { playerId: input.sellerPlayerId, itemId: item.id } },
    create: {
      playerId: input.sellerPlayerId,
      itemId: item.id,
      studioId: item.studioId,
      quantity: 0,
      source: "P2P",
      lockedForListingId: listing.id,
    },
    update: { lockedForListingId: listing.id },
  });

  return toP2PListingDto(listing);
}

export async function getListing(id: string): Promise<P2PListingDto | null> {
  const row = await prisma.p2PListing.findUnique({ where: { id } });
  return row ? toP2PListingDto(row) : null;
}

export type TradeQuoteResult = {
  trade: P2PTradeDto;
  quote: {
    destination: string;
    asset: Asset;
    amount: string;
    memo: string;
    unsignedXdr: string;
  };
};

export async function createTradeQuote(input: {
  buyerPlayerId: string;
  listingId: string;
}): Promise<TradeQuoteResult> {
  const listing = await prisma.p2PListing.findUnique({
    where: { id: input.listingId },
    include: { seller: true, item: true },
  });
  if (!listing) throw new Error("listing not found");
  if (listing.status !== "ACTIVE") throw new Error("listing not available");
  if (listing.sellerPlayerId === input.buyerPlayerId) throw new Error("cannot buy your own listing");

  const platformFee = feeAmount(listing.price, env.PLATFORM_FEE_BPS);
  const net = netAmount(listing.price, env.PLATFORM_FEE_BPS);

  const trade = await prisma.$transaction(async (tx) => {
    await tx.p2PListing.update({ where: { id: listing.id }, data: { status: "LOCKED", lockedAt: new Date() } });
    await tx.itemOwnership.updateMany({
      where: { playerId: listing.sellerPlayerId, itemId: listing.itemId },
      data: { lockedForListingId: listing.id },
    });
    return tx.p2PTrade.create({
      data: {
        listingId: listing.id,
        buyerPlayerId: input.buyerPlayerId,
        sellerPlayerId: listing.sellerPlayerId,
        price: listing.price,
        currency: listing.currency,
        platformFeeAmount: platformFee,
        netToSellerAmount: net,
        status: "ESCROW_PENDING",
        idempotencyKey: `p2p-quote:${input.buyerPlayerId}:${listing.id}:${Date.now()}`,
      },
    });
  });

  const asset: Asset =
    trade.currency === "XLM"
      ? { code: "XLM" }
      : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };
  const amount = toStellarAmount(trade.price);
  const unsignedXdr = await buildPaymentXdr({
    destination: env.STELLAR_RECEIVING_ACCOUNT,
    asset,
    amount,
    memo: trade.id,
    source: env.STELLAR_RECEIVING_ACCOUNT,
  });

  return {
    trade: toP2PTradeDto(trade),
    quote: {
      destination: env.STELLAR_RECEIVING_ACCOUNT,
      asset,
      amount,
      memo: trade.id,
      unsignedXdr,
    },
  };
}

export async function getTrade(tradeId: string): Promise<P2PTradeDto | null> {
  const row = await prisma.p2PTrade.findUnique({ where: { id: tradeId } });
  return row ? toP2PTradeDto(row) : null;
}

export type StudioP2PListing = P2PListingDto & {
  itemName: string;
  sellerHandle: string | null;
  sellerWallet: string;
};

export async function getStudioP2PListings(
  studioId: string,
  opts: {
    status?: P2PListingStatus;
    page: number;
    pageSize: number;
  },
): Promise<{ listings: StudioP2PListing[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.P2PListingWhereInput = { studioId };
  if (opts.status) where.status = opts.status;

  const [rows, total] = await Promise.all([
    prisma.p2PListing.findMany({
      where,
      include: {
        item: { select: { name: true } },
        seller: { select: { walletAddress: true, handle: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.p2PListing.count({ where }),
  ]);

  return {
    listings: rows.map((row) => ({
      ...toP2PListingDto(row),
      itemName: row.item.name,
      sellerHandle: row.seller.handle,
      sellerWallet: row.seller.walletAddress,
    })),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export type StudioP2PTrade = P2PTradeDto & {
  itemName: string;
  buyerWallet: string;
  sellerWallet: string;
};

export async function getStudioP2PTrades(
  studioId: string,
  opts: {
    status?: P2PTradeStatus;
    page: number;
    pageSize: number;
  },
): Promise<{ trades: StudioP2PTrade[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.P2PTradeWhereInput = { listing: { studioId } };
  if (opts.status) where.status = opts.status;

  const [rows, total] = await Promise.all([
    prisma.p2PTrade.findMany({
      where,
      include: {
        listing: { include: { item: { select: { name: true } } } },
        buyer: { select: { walletAddress: true } },
        seller: { select: { walletAddress: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.p2PTrade.count({ where }),
  ]);

  return {
    trades: rows.map((row) => ({
      ...toP2PTradeDto(row),
      itemName: row.listing.item.name,
      buyerWallet: row.buyer.walletAddress,
      sellerWallet: row.seller.walletAddress,
    })),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
