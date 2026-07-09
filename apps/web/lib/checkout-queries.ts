import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { feeAmount, netAmount, toStellarAmount } from "@xgamefi/shared/money";
import { buildPaymentXdr, type Asset } from "@xgamefi/shared/stellar";
import { applyPromotion } from "@xgamefi/shared/promotions";
import { toOrderDto, type OrderDto } from "@xgamefi/shared/dto";
import { HttpError } from "./http";

export type QuoteInput = {
  playerId: string;
  itemId: string;
  quantity?: number;
  currency?: "XLM" | "USDT";
  referralCode?: string;
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

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id: input.itemId } });
    if (!item) throw new HttpError(404, "ITEM_NOT_FOUND");

    const studio = await tx.studio.findUnique({ where: { id: item.studioId } });
    if (!studio) throw new HttpError(404, "STUDIO_NOT_FOUND");
    if (studio.status !== "ACTIVE") throw new HttpError(400, "STUDIO_INACTIVE");
    if (!item.isActive || !item.isListed) throw new HttpError(400, "ITEM_UNAVAILABLE");
    if (item.stock != null && quantity > item.stock) throw new HttpError(400, "INSUFFICIENT_STOCK");

    const currency = input.currency ?? item.priceCurrency;

    const existingOrder = await tx.order.findFirst({
      where: {
        playerId: input.playerId,
        itemId: item.id,
        quantity,
        currency,
        paymentStatus: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingOrder) {
      const discountedAmount = existingOrder.grossAmount.minus(existingOrder.discountAmount);
      const asset: Asset =
        currency === "XLM"
          ? { code: "XLM" }
          : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };
      const amount = toStellarAmount(discountedAmount);
      const unsignedXdr = await buildPaymentXdr({
        destination: env.STELLAR_RECEIVING_ACCOUNT,
        asset,
        amount,
        memo: existingOrder.id,
        source: env.STELLAR_RECEIVING_ACCOUNT,
      });
      return {
        order: toOrderDto(existingOrder),
        quote: {
          destination: env.STELLAR_RECEIVING_ACCOUNT,
          asset,
          amount,
          memo: existingOrder.id,
          unsignedXdr,
        },
      };
    }

    const unitPrice = item.priceAmount;
    const grossAmount = unitPrice.mul(quantity);

    const now = new Date();
    const playerHasPaidOrder =
      (await tx.order.count({ where: { playerId: input.playerId, paymentStatus: "PAID" } })) > 0;

    const candidates = await tx.promotion.findMany({
      where: {
        studioId: studio.id,
        isActive: true,
        OR: [{ appliesToItemIds: { isEmpty: true } }, { appliesToItemIds: { has: item.id } }],
      },
    });

    let discountAmount = new Prisma.Decimal(0);
    let promotionId: string | undefined;
    for (const p of candidates) {
      const r = applyPromotion({
        promotion: {
          id: p.id,
          type: p.type,
          value: p.value,
          currency: p.currency,
          appliesToItemIds: p.appliesToItemIds,
          bundleConfig: p.bundleConfig,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          usageLimit: p.usageLimit,
          usageCount: p.usageCount,
          isActive: p.isActive,
        },
        itemId: item.id,
        quantity,
        unitPrice: item.priceAmount,
        now,
        playerHasPaidOrder,
      });
      if (r.promotionId && r.discountAmount.greaterThan(discountAmount)) {
        discountAmount = r.discountAmount;
        promotionId = r.promotionId;
      }
    }

    const discountedAmount = grossAmount.minus(discountAmount);
    const platformFeeAmount = feeAmount(discountedAmount, studio.platformFeeBps);
    const netToStudioAmount = netAmount(discountedAmount, studio.platformFeeBps);

    const idempotencyKey = `quote:${input.playerId}:${input.itemId}:${quantity}:${currency}:${Date.now()}`;

    const order = await tx.order.create({
      data: {
        studioId: studio.id,
        itemId: item.id,
        playerId: input.playerId,
        quantity,
        currency,
        grossAmount,
        discountAmount,
        platformFeeAmount,
        netToStudioAmount,
        promotionId: promotionId ?? null,
        referralCodeUsed: input.referralCode ?? null,
        idempotencyKey,
        paymentStatus: "PENDING",
        deliveryStatus: "PENDING",
      },
    });

    if (promotionId) {
      await tx.promotion.update({ where: { id: promotionId }, data: { usageCount: { increment: 1 } } });
    }

    const asset: Asset =
      currency === "XLM"
        ? { code: "XLM" }
        : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

    const amount = toStellarAmount(discountedAmount);
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
  });
}

export async function getOrder(orderId: string): Promise<Prisma.OrderGetPayload<{ include: { item: true; studio: true } }> | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: { item: true, studio: true } });
}

export async function publishOrderEvent(orderId: string, event: { paymentStatus?: string; deliveryStatus?: string }) {
  const redis = (await import("@xgamefi/shared/queues")).getRedis();
  await redis.publish(`order-events:${orderId}`, JSON.stringify(event));
}
