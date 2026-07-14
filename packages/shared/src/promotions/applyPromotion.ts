import { Prisma } from "@xgamefi/db";

export type PromoType = "PERCENT" | "FIXED" | "BUNDLE" | "FIRST_PURCHASE";

export interface PromotionInput {
  id: string;
  code?: string | null;
  type: PromoType;
  value: Prisma.Decimal;
  currency: string | null;
  appliesToItemIds: string[];
  bundleConfig: unknown | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
}

export interface ApplyPromotionArgs {
  promotion: PromotionInput;
  itemId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  now: Date;
  playerHasPaidOrder: boolean;
  promotionCode?: string | null;
}

export interface ApplyPromotionResult {
  discountAmount: Prisma.Decimal;
  promotionId?: string;
}

interface BundleConfig {
  itemId: string;
  quantity: number;
  bundlePrice: string;
}

const ZERO = new Prisma.Decimal(0);

function clamp7(raw: Prisma.Decimal, gross: Prisma.Decimal): Prisma.Decimal {
  let d = raw.lessThan(ZERO) ? ZERO : raw;
  if (d.greaterThan(gross)) d = gross;
  return new Prisma.Decimal(d.toDecimalPlaces(7, Prisma.Decimal.ROUND_DOWN));
}

function isWindowOpen(p: PromotionInput, now: Date): boolean {
  if (!p.isActive) return false;
  if (p.startsAt && now.getTime() < p.startsAt.getTime()) return false;
  if (p.endsAt && now.getTime() > p.endsAt.getTime()) return false;
  if (p.usageLimit != null && p.usageCount >= p.usageLimit) return false;
  return true;
}

function none(): ApplyPromotionResult {
  return { discountAmount: ZERO };
}

export function applyPromotion(args: ApplyPromotionArgs): ApplyPromotionResult {
  const { promotion: p, itemId, quantity, unitPrice, now, playerHasPaidOrder, promotionCode } = args;
  const gross = unitPrice.mul(quantity);

  if (!isWindowOpen(p, now)) return none();
  if (p.appliesToItemIds.length > 0 && !p.appliesToItemIds.includes(itemId)) return none();

  // Coupon gating:
  // - caller supplied a code  → only promotions with a matching (case-insensitive) code apply
  // - caller supplied no code → only code-less promotions apply (existing auto-apply behavior)
  if (promotionCode) {
    if (!p.code || p.code.toLowerCase() !== promotionCode.toLowerCase()) return none();
  } else {
    if (p.code) return none();
  }

  let raw: Prisma.Decimal;

  switch (p.type) {
    case "PERCENT":
      raw = gross.mul(p.value).div(100);
      break;
    case "FIXED":
      raw = p.value;
      break;
    case "BUNDLE": {
      const cfg = p.bundleConfig as BundleConfig | null;
      if (!cfg || cfg.quantity !== quantity) return none();
      const bundlePrice = new Prisma.Decimal(cfg.bundlePrice);
      raw = gross.minus(bundlePrice);
      break;
    }
    case "FIRST_PURCHASE": {
      if (playerHasPaidOrder) return none();
      raw = p.currency == null ? gross.mul(p.value).div(100) : p.value;
      break;
    }
    default:
      return none();
  }

  const discountAmount = clamp7(raw, gross);
  if (discountAmount.lessThanOrEqualTo(ZERO)) return none();
  return { discountAmount, promotionId: p.id };
}
