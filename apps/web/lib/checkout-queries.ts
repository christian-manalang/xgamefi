import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { feeAmount, netAmount, toStellarAmount } from "@xgamefi/shared/money";
import { buildPaymentXdr, type Asset } from "@xgamefi/shared/stellar";
import { toOrderDto, type OrderDto } from "@xgamefi/shared/dto";

export type QuoteInput = {
  playerId: string;
  itemId: string;
  quantity?: number;
  currency?: "XLM" | "USDT";
};

export type QuoteResult = {
  order: OrderDto;
  quote: {
    destination: string;
    asset: Asset;
    amount: string;
    memo: string;
    unsignedXdr: string;
  };
};

export async function createOrderQuote(input: QuoteInput): Promise<QuoteResult> {
  const quantity = input.quantity ?? 1;
  const item = await prisma.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error("item not found");

  const currency = input.currency ?? item.priceCurrency;
  const unitPrice = item.priceAmount;
  const gross = unitPrice.times(quantity);
  const platformFee = feeAmount(gross, env.PLATFORM_FEE_BPS);
  const net = netAmount(gross, env.PLATFORM_FEE_BPS);

  const idempotencyKey = `quote:${input.playerId}:${input.itemId}:${quantity}:${currency}:${Date.now()}`;

  const order = await prisma.order.create({
    data: {
      studioId: item.studioId,
      itemId: item.id,
      playerId: input.playerId,
      quantity,
      currency,
      grossAmount: gross,
      discountAmount: new Prisma.Decimal(0),
      platformFeeAmount: platformFee,
      netToStudioAmount: net,
      idempotencyKey,
      paymentStatus: "PENDING",
      deliveryStatus: "PENDING",
    },
  });

  const asset: Asset =
    currency === "XLM"
      ? { code: "XLM" }
      : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

  const amount = toStellarAmount(gross);
  const unsignedXdr = await buildPaymentXdr({
    destination: env.STELLAR_RECEIVING_ACCOUNT,
    asset,
    amount,
    memo: order.id,
    source: env.STELLAR_RECEIVING_ACCOUNT,
  });

  return {
    order: toOrderDto(order),
    quote: {
      destination: env.STELLAR_RECEIVING_ACCOUNT,
      asset,
      amount,
      memo: order.id,
      unsignedXdr,
    },
  };
}

export async function getOrder(orderId: string): Promise<Prisma.OrderGetPayload<{ include: { item: true; studio: true } }> | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: { item: true, studio: true } });
}

export async function publishOrderEvent(orderId: string, event: { paymentStatus?: string; deliveryStatus?: string }) {
  const redis = (await import("@xgamefi/shared/queues")).getRedis();
  await redis.publish(`order-events:${orderId}`, JSON.stringify(event));
}
