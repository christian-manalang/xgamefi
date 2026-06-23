# Phase 5 — Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add studio-managed Promotions (PERCENT/FIXED/BUNDLE/FIRST_PURCHASE) applied at checkout-quote time, and a player Referral program (code/bind/qualify) whose first-qualifying-purchase auto-pays the referrer, both ledgered server-side.

**Architecture:** Promotion math lives in a new pure module `@xgamefi/shared/promotions` (`applyPromotion`) that the existing Phase-3 `POST /checkout/quote` handler calls between gross and fee, recording `discountAmount` + `promotionId` on the Order — never recomputed client-side. Referral qualification hooks the existing Phase-3 `verifyAndAdvanceOrder` success path: on an invitee's first PAID order it marks the `Referral` QUALIFIED and enqueues a new idempotent `referral-reward` BullMQ worker job that calls the shared `sendPayment` and writes `LedgerEntry(REFERRAL_REWARD)`. New REST handlers under `/api/v1/referrals` and `/api/v1/studios/:id/promotions`; player page `/s/[slug]/referrals` and studio pages `/dashboard/promotions` + `/dashboard/referrals`.

**Tech Stack:** Next.js 16.2.x (App Router, async `cookies/params`), React 19.2.x, TypeScript 5.x (`strict`), Prisma 7.x (`@prisma/client`, pg adapter, `Prisma.Decimal`), bignumber.js (latest), BullMQ + ioredis (latest), Redis 7.x, Zod (latest), Vitest + @playwright/test (latest), Tailwind v4.3.x. Node 22 LTS, pnpm 10.x.

## Global Constraints

- Discount is computed server-side at quote time, recorded on `Order.discountAmount` + `Order.promotionId`, and **never recomputed client-side**.
- Fee is applied to the **discounted** price: gross → discount → `feeAmount(discounted, bps)` → net (`netAmount(discounted, bps)`); fee never charged on the discount.
- `referral-reward` job is **idempotent and keys off `Referral.status`** (only acts when `QUALIFIED`; a retry/replay never double-pays); `Referral.status` advances `QUALIFIED → REWARDED` inside a `prisma.$transaction`.
- All money is `Prisma.Decimal` / `bignumber.js`, formatted to exactly **7 decimal places** for Stellar (`toStellarAmount`); never JS `number`.
- Every studio-scoped query (promotions list/create/update/delete, dashboard referrals) passes through `scopeToStudio(principal, studioId)` and filters by `studioId`; cross-studio access denied.
- Rate-limit the promotion listing endpoint and all `/referrals` endpoints in Redis (per `AGENT.md` §7 — listing + checkout-adjacent endpoints).
- Inputs validated with Zod; responses are mapped DTOs (`@xgamefi/shared/dto`) — never raw Prisma rows or stack traces.
- `FIRST_PURCHASE` promotion applies only when the player has **no prior `Order` with `paymentStatus = PAID`**.
- Promotion eligibility respects `isActive`, `startsAt`/`endsAt` (inclusive window around `now`), `usageLimit`/`usageCount` (skip when `usageCount >= usageLimit`), and `appliesToItemIds` (empty array = all items).
- `usageCount` increments by 1 only when an Order is created with that `promotionId`, inside the quote transaction.
- Referral binding ties an invitee `Player` to a referrer via the referral cookie (`xgf_ref`) read at bind time + the player's wallet; a player cannot bind to themselves and cannot rebind once `referredByPlayerId` is set.
- Pinned versions: next 16.2.x, react/react-dom 19.2.x, typescript 5.x, prisma/@prisma/client 7.x (≥7.8), @stellar/stellar-sdk 15.1.x, bullmq+ioredis latest, bignumber.js latest, zod latest, vitest latest.

---

## File Structure

**`packages/shared` (pure, tested first):**
- Create: `packages/shared/src/promotions/applyPromotion.ts` — pure promotion math + eligibility.
- Create: `packages/shared/src/promotions/index.ts` — re-export, so `@xgamefi/shared/promotions` resolves.
- Create: `packages/shared/src/promotions/applyPromotion.test.ts` — unit tests (all 4 types + gating).
- Create: `packages/shared/src/dto/promotion.ts` — `toPromotionDto`.
- Create: `packages/shared/src/dto/referral.ts` — `toReferralDto`, `toReferralPerformanceDto`.
- Create: `packages/shared/src/zod/promotion.ts` — `CreatePromotionInput`, `UpdatePromotionInput`.
- Create: `packages/shared/src/zod/referral.ts` — `ReferralBindInput`.
- Modify: `packages/shared/src/queues.ts` — add `referral-reward` to queue-name union/registry (the registry stub exists from P0).

**`apps/worker` (referral-reward job):**
- Create: `apps/worker/src/jobs/referral-reward/processor.ts` — `referralRewardProcessor`.
- Create: `apps/worker/src/jobs/referral-reward/processor.test.ts` — idempotency + payment + ledger tests.
- Create: `apps/worker/src/jobs/referral-reward/register.ts` — `registerWorker("referral-reward", referralRewardProcessor)`.
- Modify: `apps/worker/src/index.ts` — import + call `register.ts`.

**`apps/web` (handlers + pages):**
- Create: `apps/web/app/api/v1/studios/[id]/promotions/route.ts` — `GET` (list) + `POST` (create).
- Create: `apps/web/app/api/v1/studios/[id]/promotions/[promoId]/route.ts` — `PATCH` + `DELETE`.
- Create: `apps/web/app/api/v1/referrals/route.ts` — `POST` (generate/return code).
- Create: `apps/web/app/api/v1/referrals/me/route.ts` — `GET` (performance).
- Create: `apps/web/app/api/v1/referrals/bind/route.ts` — `POST` (bind invitee).
- Create: `apps/web/app/(studio)/dashboard/promotions/page.tsx` — promotions management page.
- Create: `apps/web/app/(studio)/dashboard/referrals/page.tsx` — referral performance + payouts page.
- Create: `apps/web/app/(storefront)/s/[slug]/referrals/page.tsx` — player generate/share/status page.
- Create: integration tests alongside each handler (`route.test.ts`).

**Phase-3 files MODIFIED (hook points — do not recreate):**
- Modify: `apps/web/app/api/v1/checkout/quote/route.ts` — insert `applyPromotion` between gross and fee; persist `discountAmount`/`promotionId`/`referralCodeUsed`; increment `usageCount`.
- Modify: `packages/shared/src/settlement/verifyAndAdvanceOrder.ts` — in the first-PAID branch, mark Referral QUALIFIED + enqueue `referral-reward`.

---

### Task 1: Promotion math + eligibility (`@xgamefi/shared/promotions`)

**Files:**
- Create: `packages/shared/src/promotions/applyPromotion.ts`
- Create: `packages/shared/src/promotions/index.ts`
- Test: `packages/shared/src/promotions/applyPromotion.test.ts`

**Interfaces:**
- Consumes: `Prisma`, `Prisma.Decimal` from `@xgamefi/db`; `BigNumber` from `bignumber.js`.
- Produces:
  ```ts
  // @xgamefi/shared/promotions
  type PromoType = "PERCENT" | "FIXED" | "BUNDLE" | "FIRST_PURCHASE";
  interface PromotionInput {
    id: string;
    type: PromoType;
    value: Prisma.Decimal;           // PERCENT: whole percent (e.g. 10 = 10%); FIXED/BUNDLE: currency amount
    currency: string | null;
    appliesToItemIds: string[];      // [] = all items
    bundleConfig: unknown | null;    // { itemId: string; quantity: number; bundlePrice: string } when BUNDLE
    startsAt: Date | null;
    endsAt: Date | null;
    usageLimit: number | null;
    usageCount: number;
    isActive: boolean;
  }
  interface ApplyPromotionArgs {
    promotion: PromotionInput;
    itemId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;       // per-unit price of the item
    now: Date;
    playerHasPaidOrder: boolean;     // caller pre-resolves the FIRST_PURCHASE gate
  }
  interface ApplyPromotionResult {
    discountAmount: Prisma.Decimal;  // >= 0, <= gross, 7dp
    promotionId?: string;            // set only when discount > 0 / promo applied
  }
  function applyPromotion(args: ApplyPromotionArgs): ApplyPromotionResult;
  ```
  Semantics: `gross = unitPrice * quantity`. Eligibility (all must hold or discount is `0`/no promotionId): `isActive`; `now >= startsAt` (if set) and `now <= endsAt` (if set); `usageLimit == null || usageCount < usageLimit`; `appliesToItemIds.length === 0 || appliesToItemIds.includes(itemId)`. Math by type — PERCENT: `discount = gross * value/100`; FIXED: `discount = min(value, gross)`; BUNDLE: `discount = max(0, gross - bundlePrice)` where the configured `bundleConfig.quantity` matches `quantity` (else discount `0`); FIRST_PURCHASE: if `playerHasPaidOrder` is true → discount `0` and no promotionId; else behaves like PERCENT or FIXED using `value` (`currency` null ⇒ percent, currency set ⇒ fixed amount). All results rounded **down** to 7dp and clamped to `[0, gross]`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/promotions/applyPromotion.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { applyPromotion, type PromotionInput } from "./applyPromotion";

const D = (s: string) => new Prisma.Decimal(s);
const NOW = new Date("2026-06-23T12:00:00Z");

const base = (over: Partial<PromotionInput>): PromotionInput => ({
  id: "promo-1",
  type: "PERCENT",
  value: D("10"),
  currency: null,
  appliesToItemIds: [],
  bundleConfig: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usageCount: 0,
  isActive: true,
  ...over,
});

describe("applyPromotion", () => {
  it("PERCENT: 10% off a 1.0000000 unit price x1 = 0.1000000 discount", () => {
    const r = applyPromotion({
      promotion: base({ type: "PERCENT", value: D("10") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.1000000");
    expect(r.promotionId).toBe("promo-1");
  });

  it("PERCENT: applies per gross (qty 3 of 2.5 => 7.5 gross, 20% => 1.5)", () => {
    const r = applyPromotion({
      promotion: base({ type: "PERCENT", value: D("20") }),
      itemId: "i1", quantity: 3, unitPrice: D("2.5"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("1.5000000");
  });

  it("FIXED: subtracts a flat amount", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIXED", value: D("0.4"), currency: "USDT" }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.4000000");
  });

  it("FIXED: clamps discount to gross (never negative net)", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIXED", value: D("5"), currency: "USDT" }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("1.0000000");
  });

  it("BUNDLE: prices a matching set (3x1.0 => 3.0 gross, bundlePrice 2.5 => 0.5 off)", () => {
    const r = applyPromotion({
      promotion: base({ type: "BUNDLE", bundleConfig: { itemId: "i1", quantity: 3, bundlePrice: "2.5" } }),
      itemId: "i1", quantity: 3, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.5000000");
  });

  it("BUNDLE: no discount when quantity does not match the bundle set", () => {
    const r = applyPromotion({
      promotion: base({ type: "BUNDLE", bundleConfig: { itemId: "i1", quantity: 3, bundlePrice: "2.5" } }),
      itemId: "i1", quantity: 2, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    expect(r.promotionId).toBeUndefined();
  });

  it("FIRST_PURCHASE: applies (as percent) when player has no prior PAID order", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIRST_PURCHASE", value: D("50") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.5000000");
    expect(r.promotionId).toBe("promo-1");
  });

  it("FIRST_PURCHASE: gated off when player already has a PAID order", () => {
    const r = applyPromotion({
      promotion: base({ type: "FIRST_PURCHASE", value: D("50") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: true,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    expect(r.promotionId).toBeUndefined();
  });

  it("respects endsAt: expired promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ endsAt: new Date("2026-06-22T00:00:00Z") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
    expect(r.promotionId).toBeUndefined();
  });

  it("respects startsAt: not-yet-active promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ startsAt: new Date("2026-06-24T00:00:00Z") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("respects usageLimit: exhausted promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ usageLimit: 5, usageCount: 5 }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("respects appliesToItemIds: non-matching item yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ appliesToItemIds: ["other-item"] }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("inactive promo yields no discount", () => {
    const r = applyPromotion({
      promotion: base({ isActive: false }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.0000000");
  });

  it("rounds discount DOWN to 7dp", () => {
    // 1/3 of 1.0 = 0.33333333... -> floored to 0.3333333
    const r = applyPromotion({
      promotion: base({ type: "PERCENT", value: D("33.333333") }),
      itemId: "i1", quantity: 1, unitPrice: D("1"), now: NOW, playerHasPaidOrder: false,
    });
    expect(r.discountAmount.toFixed(7)).toBe("0.3333333");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xgamefi/shared test applyPromotion`
Expected: FAIL — `Cannot find module './applyPromotion'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/promotions/applyPromotion.ts
import { Prisma } from "@xgamefi/db";

export type PromoType = "PERCENT" | "FIXED" | "BUNDLE" | "FIRST_PURCHASE";

export interface PromotionInput {
  id: string;
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

// Floor to 7dp and clamp to [0, gross].
function clamp7(raw: Prisma.Decimal, gross: Prisma.Decimal): Prisma.Decimal {
  let d = raw.lessThan(ZERO) ? ZERO : raw;
  if (d.greaterThan(gross)) d = gross;
  // ROUND_DOWN = 1 in decimal.js
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
  const { promotion: p, itemId, quantity, unitPrice, now, playerHasPaidOrder } = args;
  const gross = unitPrice.mul(quantity);

  if (!isWindowOpen(p, now)) return none();
  if (p.appliesToItemIds.length > 0 && !p.appliesToItemIds.includes(itemId)) return none();

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
      // currency null => percent of gross; currency set => fixed amount
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
```

```ts
// packages/shared/src/promotions/index.ts
export {
  applyPromotion,
  type PromoType,
  type PromotionInput,
  type ApplyPromotionArgs,
  type ApplyPromotionResult,
} from "./applyPromotion";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @xgamefi/shared test applyPromotion`
Expected: PASS (15 tests).

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/shared exec tsc --noEmit
git add packages/shared/src/promotions
git commit -m "feat(shared): add applyPromotion pure promotion math + eligibility"
```

---

### Task 2: Promotion + Referral Zod schemas and DTO mappers

**Files:**
- Create: `packages/shared/src/zod/promotion.ts`
- Create: `packages/shared/src/zod/referral.ts`
- Create: `packages/shared/src/dto/promotion.ts`
- Create: `packages/shared/src/dto/referral.ts`
- Test: `packages/shared/src/dto/promotion.test.ts`
- Test: `packages/shared/src/dto/referral.test.ts`

**Interfaces:**
- Consumes: `Prisma` from `@xgamefi/db`; `toStellarAmount` from `@xgamefi/shared/money`; `z` from `zod`.
- Produces:
  ```ts
  // @xgamefi/shared/zod (promotion.ts)
  const CreatePromotionInput: z.ZodType<{
    name: string; type: "PERCENT"|"FIXED"|"BUNDLE"|"FIRST_PURCHASE";
    value: string; currency?: "XLM"|"USDT" | null; appliesToItemIds?: string[];
    bundleConfig?: { itemId: string; quantity: number; bundlePrice: string } | null;
    startsAt?: string | null; endsAt?: string | null; usageLimit?: number | null; isActive?: boolean;
  }>;
  const UpdatePromotionInput; // all fields optional partial of the above
  // @xgamefi/shared/zod (referral.ts)
  const ReferralBindInput: z.ZodType<{ code: string }>;
  // @xgamefi/shared/dto
  function toPromotionDto(row): PromotionDto;
  function toReferralDto(row): ReferralDto;
  function toReferralPerformanceDto(args): ReferralPerformanceDto;
  ```

- [ ] **Step 1: Write the failing DTO tests**

```ts
// packages/shared/src/dto/promotion.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toPromotionDto } from "./promotion";

describe("toPromotionDto", () => {
  it("maps a promotion row to a DTO with 7dp string value and no internal fields", () => {
    const dto = toPromotionDto({
      id: "p1", studioId: "s1", name: "Launch 10%", type: "PERCENT",
      value: new Prisma.Decimal("10"), currency: null, appliesToItemIds: ["i1"],
      bundleConfig: null, startsAt: null, endsAt: null,
      usageLimit: 100, usageCount: 3, isActive: true,
      createdAt: new Date("2026-06-23T00:00:00Z"), updatedAt: new Date("2026-06-23T00:00:00Z"),
    });
    expect(dto).toEqual({
      id: "p1", name: "Launch 10%", type: "PERCENT", value: "10.0000000",
      currency: null, appliesToItemIds: ["i1"], bundleConfig: null,
      startsAt: null, endsAt: null, usageLimit: 100, usageCount: 3, isActive: true,
      createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z",
    });
    expect("studioId" in dto).toBe(false);
  });
});
```

```ts
// packages/shared/src/dto/referral.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toReferralDto, toReferralPerformanceDto } from "./referral";

describe("toReferralDto", () => {
  it("maps a referral row, formatting reward to 7dp when present", () => {
    const dto = toReferralDto({
      id: "r1", code: "ABC123", referrerPlayerId: "pl1", refereePlayerId: "pl2",
      status: "REWARDED", rewardAmount: new Prisma.Decimal("0.5"), rewardCurrency: "USDT",
      rewardTxHash: "tx", createdAt: new Date("2026-06-23T00:00:00Z"),
      qualifiedAt: new Date("2026-06-23T01:00:00Z"), rewardedAt: new Date("2026-06-23T02:00:00Z"),
    });
    expect(dto.code).toBe("ABC123");
    expect(dto.status).toBe("REWARDED");
    expect(dto.rewardAmount).toBe("0.5000000");
    expect(dto.rewardTxHash).toBe("tx");
  });

  it("leaves rewardAmount null when unset", () => {
    const dto = toReferralDto({
      id: "r1", code: "ABC123", referrerPlayerId: "pl1", refereePlayerId: null,
      status: "PENDING", rewardAmount: null, rewardCurrency: null, rewardTxHash: null,
      createdAt: new Date("2026-06-23T00:00:00Z"), qualifiedAt: null, rewardedAt: null,
    });
    expect(dto.rewardAmount).toBeNull();
    expect(dto.status).toBe("PENDING");
  });
});

describe("toReferralPerformanceDto", () => {
  it("aggregates counts and total rewards", () => {
    const dto = toReferralPerformanceDto({
      code: "ABC123",
      total: 5, qualified: 2, rewarded: 1,
      totalRewardAmount: new Prisma.Decimal("0.5"), rewardCurrency: "USDT",
    });
    expect(dto).toEqual({
      code: "ABC123", total: 5, qualified: 2, rewarded: 1,
      totalRewardAmount: "0.5000000", rewardCurrency: "USDT",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xgamefi/shared test dto/promotion dto/referral`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the schemas and mappers**

```ts
// packages/shared/src/zod/promotion.ts
import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,7})?$/, "must be a decimal with <=7dp");

export const BundleConfigSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  bundlePrice: decimalString,
});

export const CreatePromotionInput = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["PERCENT", "FIXED", "BUNDLE", "FIRST_PURCHASE"]),
  value: decimalString,
  currency: z.enum(["XLM", "USDT"]).nullable().optional(),
  appliesToItemIds: z.array(z.string().uuid()).default([]),
  bundleConfig: BundleConfigSchema.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.type === "BUNDLE" && !v.bundleConfig) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "BUNDLE requires bundleConfig", path: ["bundleConfig"] });
  }
  if (v.startsAt && v.endsAt && Date.parse(v.startsAt) > Date.parse(v.endsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "startsAt must be <= endsAt", path: ["endsAt"] });
  }
});

export const UpdatePromotionInput = z.object({
  name: z.string().min(1).max(120).optional(),
  value: decimalString.optional(),
  currency: z.enum(["XLM", "USDT"]).nullable().optional(),
  appliesToItemIds: z.array(z.string().uuid()).optional(),
  bundleConfig: BundleConfigSchema.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreatePromotionInputT = z.infer<typeof CreatePromotionInput>;
export type UpdatePromotionInputT = z.infer<typeof UpdatePromotionInput>;
```

```ts
// packages/shared/src/zod/referral.ts
import { z } from "zod";

export const ReferralBindInput = z.object({
  code: z.string().min(4).max(32).regex(/^[A-Z0-9]+$/, "code is uppercase alphanumeric"),
});

export type ReferralBindInputT = z.infer<typeof ReferralBindInput>;
```

```ts
// packages/shared/src/dto/promotion.ts
import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export interface PromotionDto {
  id: string;
  name: string;
  type: "PERCENT" | "FIXED" | "BUNDLE" | "FIRST_PURCHASE";
  value: string;
  currency: string | null;
  appliesToItemIds: string[];
  bundleConfig: unknown | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromotionRow {
  id: string; studioId: string; name: string;
  type: PromotionDto["type"]; value: Prisma.Decimal; currency: string | null;
  appliesToItemIds: string[]; bundleConfig: unknown | null;
  startsAt: Date | null; endsAt: Date | null;
  usageLimit: number | null; usageCount: number; isActive: boolean;
  createdAt: Date; updatedAt: Date;
}

export function toPromotionDto(row: PromotionRow): PromotionDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: toStellarAmount(row.value),
    currency: row.currency,
    appliesToItemIds: row.appliesToItemIds,
    bundleConfig: row.bundleConfig ?? null,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

```ts
// packages/shared/src/dto/referral.ts
import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export interface ReferralDto {
  id: string;
  code: string;
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED";
  refereePlayerId: string | null;
  rewardAmount: string | null;
  rewardCurrency: string | null;
  rewardTxHash: string | null;
  createdAt: string;
  qualifiedAt: string | null;
  rewardedAt: string | null;
}

interface ReferralRow {
  id: string; code: string; referrerPlayerId: string; refereePlayerId: string | null;
  status: ReferralDto["status"]; rewardAmount: Prisma.Decimal | null; rewardCurrency: string | null;
  rewardTxHash: string | null; createdAt: Date; qualifiedAt: Date | null; rewardedAt: Date | null;
}

export function toReferralDto(row: ReferralRow): ReferralDto {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    refereePlayerId: row.refereePlayerId,
    rewardAmount: row.rewardAmount ? toStellarAmount(row.rewardAmount) : null,
    rewardCurrency: row.rewardCurrency,
    rewardTxHash: row.rewardTxHash,
    createdAt: row.createdAt.toISOString(),
    qualifiedAt: row.qualifiedAt ? row.qualifiedAt.toISOString() : null,
    rewardedAt: row.rewardedAt ? row.rewardedAt.toISOString() : null,
  };
}

export interface ReferralPerformanceDto {
  code: string;
  total: number;
  qualified: number;
  rewarded: number;
  totalRewardAmount: string;
  rewardCurrency: string | null;
}

export function toReferralPerformanceDto(args: {
  code: string; total: number; qualified: number; rewarded: number;
  totalRewardAmount: Prisma.Decimal; rewardCurrency: string | null;
}): ReferralPerformanceDto {
  return {
    code: args.code,
    total: args.total,
    qualified: args.qualified,
    rewarded: args.rewarded,
    totalRewardAmount: toStellarAmount(args.totalRewardAmount),
    rewardCurrency: args.rewardCurrency,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @xgamefi/shared test dto/promotion dto/referral`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/shared exec tsc --noEmit
git add packages/shared/src/zod/promotion.ts packages/shared/src/zod/referral.ts packages/shared/src/dto/promotion.ts packages/shared/src/dto/referral.ts packages/shared/src/dto/promotion.test.ts packages/shared/src/dto/referral.test.ts
git commit -m "feat(shared): promotion+referral zod schemas and DTO mappers"
```

---

### Task 3: Promotions studio CRUD handlers

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/promotions/route.ts`
- Create: `apps/web/app/api/v1/studios/[id]/promotions/[promoId]/route.ts`
- Test: `apps/web/app/api/v1/studios/[id]/promotions/route.test.ts`
- Test: `apps/web/app/api/v1/studios/[id]/promotions/[promoId]/route.test.ts`

**Interfaces:**
- Consumes: `requireStudio`, `scopeToStudio` from `@xgamefi/shared/auth`; `prisma`, `Prisma` from `@xgamefi/db`; `CreatePromotionInput`, `UpdatePromotionInput` from `@xgamefi/shared/zod`; `toPromotionDto` from `@xgamefi/shared/dto`; `rateLimit` from `@xgamefi/shared/auth` (Redis limiter from P1).
- Produces: REST endpoints `GET/POST /api/v1/studios/:id/promotions`, `PATCH/DELETE /api/v1/studios/:id/promotions/:promoId`. List response `{ promotions: PromotionDto[] }`; create/patch response `{ promotion: PromotionDto }`; delete `{ ok: true }`.

- [ ] **Step 1: Write the failing integration tests**

```ts
// apps/web/app/api/v1/studios/[id]/promotions/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { prisma } from "@xgamefi/db";

vi.mock("@xgamefi/shared/auth", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/auth")>();
  return {
    ...mod,
    requireStudio: vi.fn(async (sid: string) => ({ kind: "user", userId: "u1", role: "STUDIO_OWNER", studioId: sid })),
    scopeToStudio: vi.fn(() => {}),
    rateLimit: vi.fn(async () => true),
  };
});

const STUDIO = "00000000-0000-0000-0000-000000000001";

async function seedStudio() {
  await prisma.studio.create({
    data: { id: STUDIO, name: "Gridlock", slug: "gridlock", payoutWalletAddress: "G", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
  });
}

describe("POST /studios/:id/promotions", () => {
  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.studio.deleteMany();
    await seedStudio();
  });

  it("creates a PERCENT promotion scoped to the studio", async () => {
    const req = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "Launch", type: "PERCENT", value: "10" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: STUDIO }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.promotion.type).toBe("PERCENT");
    expect(body.promotion.value).toBe("10.0000000");
    expect(body.promotion.usageCount).toBe(0);
    const row = await prisma.promotion.findUnique({ where: { id: body.promotion.id } });
    expect(row?.studioId).toBe(STUDIO);
  });

  it("rejects BUNDLE without bundleConfig (422)", async () => {
    const req = new Request("http://t/api/v1/studios/x/promotions", {
      method: "POST",
      body: JSON.stringify({ name: "B", type: "BUNDLE", value: "1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: STUDIO }) });
    expect(res.status).toBe(422);
  });

  it("lists only the studio's promotions", async () => {
    await prisma.promotion.create({ data: { studioId: STUDIO, name: "P", type: "FIXED", value: new (await import("@xgamefi/db")).Prisma.Decimal("0.5"), currency: "USDT", appliesToItemIds: [], usageCount: 0, isActive: true } });
    const res = await GET(new Request("http://t"), { params: Promise.resolve({ id: STUDIO }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promotions).toHaveLength(1);
  });
});
```

```ts
// apps/web/app/api/v1/studios/[id]/promotions/[promoId]/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH, DELETE } from "./route";
import { prisma, Prisma } from "@xgamefi/db";

vi.mock("@xgamefi/shared/auth", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/auth")>();
  return {
    ...mod,
    requireStudio: vi.fn(async (sid: string) => ({ kind: "user", userId: "u1", role: "STUDIO_OWNER", studioId: sid })),
    scopeToStudio: vi.fn(() => {}),
    rateLimit: vi.fn(async () => true),
  };
});

const STUDIO = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";

describe("PATCH/DELETE /studios/:id/promotions/:promoId", () => {
  let promoId: string;
  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.studio.deleteMany();
    await prisma.studio.createMany({ data: [
      { id: STUDIO, name: "A", slug: "a", payoutWalletAddress: "G", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
      { id: OTHER, name: "B", slug: "b", payoutWalletAddress: "G", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" },
    ]});
    const p = await prisma.promotion.create({ data: { studioId: STUDIO, name: "P", type: "PERCENT", value: new Prisma.Decimal("10"), appliesToItemIds: [], usageCount: 0, isActive: true } });
    promoId = p.id;
  });

  it("updates a promotion's isActive flag", async () => {
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: STUDIO, promoId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).promotion.isActive).toBe(false);
  });

  it("404s when promo belongs to another studio (tenant isolation)", async () => {
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    const res = await PATCH(req, { params: Promise.resolve({ id: OTHER, promoId }) });
    expect(res.status).toBe(404);
  });

  it("deletes a promotion", async () => {
    const res = await DELETE(new Request("http://t", { method: "DELETE" }), { params: Promise.resolve({ id: STUDIO, promoId }) });
    expect(res.status).toBe(200);
    expect(await prisma.promotion.findUnique({ where: { id: promoId } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xgamefi/web test promotions`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Write the handlers**

```ts
// apps/web/app/api/v1/studios/[id]/promotions/route.ts
import { NextRequest } from "next/server";
import { prisma, Prisma } from "@xgamefi/db";
import { requireStudio, scopeToStudio, rateLimit } from "@xgamefi/shared/auth";
import { CreatePromotionInput } from "@xgamefi/shared/zod";
import { toPromotionDto } from "@xgamefi/shared/dto";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const principal = await requireStudio(id);
  scopeToStudio(principal, id);
  if (!(await rateLimit(`promos:list:${id}`, 60, 60))) return json({ error: "rate_limited" }, 429);
  const rows = await prisma.promotion.findMany({ where: { studioId: id }, orderBy: { createdAt: "desc" } });
  return json({ promotions: rows.map(toPromotionDto) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const principal = await requireStudio(id);
  scopeToStudio(principal, id);
  const parsed = CreatePromotionInput.safeParse(await req.json());
  if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 422);
  const v = parsed.data;
  const row = await prisma.promotion.create({
    data: {
      studioId: id,
      name: v.name,
      type: v.type,
      value: new Prisma.Decimal(v.value),
      currency: v.currency ?? null,
      appliesToItemIds: v.appliesToItemIds ?? [],
      bundleConfig: v.bundleConfig ?? Prisma.DbNull,
      startsAt: v.startsAt ? new Date(v.startsAt) : null,
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      usageLimit: v.usageLimit ?? null,
      usageCount: 0,
      isActive: v.isActive ?? true,
    },
  });
  return json({ promotion: toPromotionDto(row) }, 201);
}
```

```ts
// apps/web/app/api/v1/studios/[id]/promotions/[promoId]/route.ts
import { prisma, Prisma } from "@xgamefi/db";
import { requireStudio, scopeToStudio } from "@xgamefi/shared/auth";
import { UpdatePromotionInput } from "@xgamefi/shared/zod";
import { toPromotionDto } from "@xgamefi/shared/dto";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

type Ctx = { params: Promise<{ id: string; promoId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, promoId } = await ctx.params;
  const principal = await requireStudio(id);
  scopeToStudio(principal, id);
  const existing = await prisma.promotion.findFirst({ where: { id: promoId, studioId: id } });
  if (!existing) return json({ error: "not_found" }, 404);
  const parsed = UpdatePromotionInput.safeParse(await req.json());
  if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 422);
  const v = parsed.data;
  const row = await prisma.promotion.update({
    where: { id: promoId },
    data: {
      ...(v.name !== undefined ? { name: v.name } : {}),
      ...(v.value !== undefined ? { value: new Prisma.Decimal(v.value) } : {}),
      ...(v.currency !== undefined ? { currency: v.currency } : {}),
      ...(v.appliesToItemIds !== undefined ? { appliesToItemIds: v.appliesToItemIds } : {}),
      ...(v.bundleConfig !== undefined ? { bundleConfig: v.bundleConfig ?? Prisma.DbNull } : {}),
      ...(v.startsAt !== undefined ? { startsAt: v.startsAt ? new Date(v.startsAt) : null } : {}),
      ...(v.endsAt !== undefined ? { endsAt: v.endsAt ? new Date(v.endsAt) : null } : {}),
      ...(v.usageLimit !== undefined ? { usageLimit: v.usageLimit } : {}),
      ...(v.isActive !== undefined ? { isActive: v.isActive } : {}),
    },
  });
  return json({ promotion: toPromotionDto(row) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, promoId } = await ctx.params;
  const principal = await requireStudio(id);
  scopeToStudio(principal, id);
  const existing = await prisma.promotion.findFirst({ where: { id: promoId, studioId: id } });
  if (!existing) return json({ error: "not_found" }, 404);
  await prisma.promotion.delete({ where: { id: promoId } });
  return json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @xgamefi/web test promotions`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/web exec tsc --noEmit
git add "apps/web/app/api/v1/studios/[id]/promotions"
git commit -m "feat(web): studio promotion CRUD handlers with tenant scoping"
```

---

### Task 4: Hook promotions into Phase-3 checkout/quote

**Files:**
- Modify: `apps/web/app/api/v1/checkout/quote/route.ts` (Phase-3 file — modify, do NOT recreate)
- Test: `apps/web/app/api/v1/checkout/quote/promotion.test.ts` (new test file for the promotion behavior)

**Interfaces:**
- Consumes (existing Phase-3): the quote handler already resolves `item` (`priceAmount`, `priceCurrency`), `quantity`, `studio.platformFeeBps`, the player principal, computes `grossAmount`, `platformFeeAmount` via `feeAmount`, `netToStudioAmount` via `netAmount`, and creates the `Order` `PENDING` with `idempotencyKey`. The quote `CheckoutQuoteInput` already accepts `{ slug, itemId, qty, referralCode? }`.
- Consumes (new): `applyPromotion` from `@xgamefi/shared/promotions`; `feeAmount`, `netAmount` from `@xgamefi/shared/money`.
- Produces: the quote now selects the best eligible active promotion for the item, computes `discountAmount`, sets the discounted price as the fee base, persists `discountAmount` + `promotionId` + `referralCodeUsed` on the Order, and increments `Promotion.usageCount` — all in the existing quote `$transaction`. Quote response gains `discountAmount` and `promotionId`.

The exact edit. The Phase-3 handler currently has a block like the BEFORE shown below (computes fee directly on gross). Replace it with AFTER.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/checkout/quote/promotion.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { prisma, Prisma } from "@xgamefi/db";

vi.mock("@xgamefi/shared/auth", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/auth")>();
  return { ...mod, requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: PLAYER, walletAddress: "GPLAYER" })), rateLimit: vi.fn(async () => true) };
});

const STUDIO = "00000000-0000-0000-0000-000000000001";
const ITEM = "00000000-0000-0000-0000-0000000000a1";
const PLAYER = "00000000-0000-0000-0000-0000000000b1";

async function seed(promoType?: "PERCENT" | "FIRST_PURCHASE") {
  await prisma.studio.create({ data: { id: STUDIO, name: "G", slug: "gridlock", payoutWalletAddress: "GDEST", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" } });
  await prisma.item.create({ data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true } });
  await prisma.player.create({ data: { id: PLAYER, walletAddress: "GPLAYER" } });
  if (promoType) {
    await prisma.promotion.create({ data: { studioId: STUDIO, name: "P", type: promoType, value: new Prisma.Decimal("10"), appliesToItemIds: [], usageCount: 0, isActive: true } });
  }
}

function quoteReq() {
  return new Request("http://t/api/v1/checkout/quote", {
    method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ slug: "gridlock", itemId: ITEM, qty: 1 }),
  });
}

describe("checkout/quote with promotions", () => {
  beforeEach(async () => {
    await prisma.order.deleteMany(); await prisma.promotion.deleteMany();
    await prisma.item.deleteMany(); await prisma.player.deleteMany(); await prisma.studio.deleteMany();
  });

  it("applies a 10% PERCENT promo: discount 0.1, fee on discounted 0.9", async () => {
    await seed("PERCENT");
    const res = await POST(quoteReq());
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.grossAmount).toBe("1.0000000");
    expect(b.discountAmount).toBe("0.1000000");
    // fee = 5% of discounted 0.9 = 0.0450000 ; net = 0.9 - 0.045 = 0.8550000
    expect(b.platformFeeAmount).toBe("0.0450000");
    expect(b.netToStudioAmount).toBe("0.8550000");
    const order = await prisma.order.findFirst();
    expect(order?.discountAmount?.toFixed(7)).toBe("0.1000000");
    expect(order?.promotionId).toBe(b.promotionId);
    const promo = await prisma.promotion.findFirst();
    expect(promo?.usageCount).toBe(1);
  });

  it("computes fee on full gross when no promo exists", async () => {
    await seed();
    const res = await POST(quoteReq());
    const b = await res.json();
    expect(b.discountAmount).toBe("0.0000000");
    expect(b.platformFeeAmount).toBe("0.0500000");
    expect(b.netToStudioAmount).toBe("0.9500000");
    expect(b.promotionId ?? null).toBeNull();
  });

  it("FIRST_PURCHASE applies for a player with no prior PAID order", async () => {
    await seed("FIRST_PURCHASE");
    const res = await POST(quoteReq());
    const b = await res.json();
    expect(b.discountAmount).toBe("0.1000000");
  });

  it("FIRST_PURCHASE skipped when player already has a PAID order", async () => {
    await seed("FIRST_PURCHASE");
    await prisma.order.create({ data: {
      studioId: STUDIO, itemId: ITEM, playerId: PLAYER, quantity: 1, currency: "USDT",
      grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
      platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
      idempotencyKey: "prior", paymentStatus: "PAID", deliveryStatus: "DELIVERED",
    }});
    const res = await POST(quoteReq());
    const b = await res.json();
    expect(b.discountAmount).toBe("0.0000000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test checkout/quote/promotion`
Expected: FAIL — quote does not yet apply promotions (`discountAmount` undefined / fee on full gross).

- [ ] **Step 3: Apply the exact edit to the Phase-3 quote handler**

BEFORE (the existing Phase-3 fee block inside the quote `$transaction`, after `item` and `studio` are loaded and `grossAmount` is computed):

```ts
    // --- Phase 3 (BEFORE) ---
    const grossAmount = item.priceAmount.mul(input.qty);
    const platformFeeAmount = feeAmount(grossAmount, studio.platformFeeBps);
    const netToStudioAmount = netAmount(grossAmount, studio.platformFeeBps);

    const order = await tx.order.create({
      data: {
        studioId: studio.id,
        itemId: item.id,
        playerId: principal.playerId,
        quantity: input.qty,
        currency: item.priceCurrency,
        grossAmount,
        platformFeeAmount,
        netToStudioAmount,
        idempotencyKey,
        paymentStatus: "PENDING",
        deliveryStatus: "PENDING",
      },
    });
```

AFTER (insert promotion selection + apply; fee base becomes discounted price; persist discount/promotionId/referralCodeUsed; bump usageCount):

```ts
    // --- Phase 5 (AFTER) ---
    const grossAmount = item.priceAmount.mul(input.qty);

    // Select the best eligible active promotion for this item.
    const now = new Date();
    const playerHasPaidOrder =
      (await tx.order.count({ where: { playerId: principal.playerId, paymentStatus: "PAID" } })) > 0;
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
          id: p.id, type: p.type, value: p.value, currency: p.currency,
          appliesToItemIds: p.appliesToItemIds, bundleConfig: p.bundleConfig,
          startsAt: p.startsAt, endsAt: p.endsAt, usageLimit: p.usageLimit,
          usageCount: p.usageCount, isActive: p.isActive,
        },
        itemId: item.id, quantity: input.qty, unitPrice: item.priceAmount, now, playerHasPaidOrder,
      });
      if (r.promotionId && r.discountAmount.greaterThan(discountAmount)) {
        discountAmount = r.discountAmount;
        promotionId = r.promotionId;
      }
    }

    const discountedAmount = grossAmount.minus(discountAmount);
    const platformFeeAmount = feeAmount(discountedAmount, studio.platformFeeBps);
    const netToStudioAmount = netAmount(discountedAmount, studio.platformFeeBps);

    const order = await tx.order.create({
      data: {
        studioId: studio.id,
        itemId: item.id,
        playerId: principal.playerId,
        quantity: input.qty,
        currency: item.priceCurrency,
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
```

Also add to the handler's imports (top of file) and to the JSON response body builder:

```ts
// add import
import { applyPromotion } from "@xgamefi/shared/promotions";
```

```ts
// in the response object returned to the client, add:
      discountAmount: toStellarAmount(order.discountAmount),
      promotionId: order.promotionId,
```
(The handler already imports `toStellarAmount` and returns `grossAmount`, `platformFeeAmount`, `netToStudioAmount`; `discountAmount`/`promotionId` are appended alongside. The payment `amount` the player signs is computed from the **discounted** price — i.e. `toStellarAmount(discountedAmount)` — replacing any prior use of `grossAmount` for the memo/destination amount.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test checkout/quote`
Expected: PASS (promotion tests + existing Phase-3 quote tests still green).

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/web exec tsc --noEmit
git add "apps/web/app/api/v1/checkout/quote"
git commit -m "feat(web): apply promotion at quote time, fee on discounted price, record on Order"
```

---

### Task 5: Referral endpoints — generate, performance, bind

**Files:**
- Create: `apps/web/app/api/v1/referrals/route.ts` (POST generate/return code)
- Create: `apps/web/app/api/v1/referrals/me/route.ts` (GET performance)
- Create: `apps/web/app/api/v1/referrals/bind/route.ts` (POST bind invitee)
- Test: `apps/web/app/api/v1/referrals/route.test.ts`
- Test: `apps/web/app/api/v1/referrals/bind/route.test.ts`

**Interfaces:**
- Consumes: `requirePrincipal` from `@xgamefi/shared/auth` (returns the player `Principal`); `rateLimit` from `@xgamefi/shared/auth`; `prisma`, `Prisma` from `@xgamefi/db`; `ReferralBindInput` from `@xgamefi/shared/zod`; `toReferralDto`, `toReferralPerformanceDto` from `@xgamefi/shared/dto`; `cookies` from `next/headers`.
- Produces:
  - `POST /referrals` → `{ code }` — idempotent: returns the player's existing referrer code (`Referral` row with `referrerPlayerId = player, refereePlayerId = null`) or creates one.
  - `GET /referrals/me` → `ReferralPerformanceDto`.
  - `POST /referrals/bind` (body `{ code }`, also reads `xgf_ref` cookie as fallback) → binds the current player as referee of the referrer who owns `code`; sets `Player.referredByPlayerId` and creates a per-invitee `Referral` row (`status PENDING`, `refereePlayerId = invitee`). No-op if already bound or self-referral.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/app/api/v1/referrals/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { GET } from "./me/route";
import { prisma, Prisma } from "@xgamefi/db";

const PLAYER = "00000000-0000-0000-0000-0000000000b1";
vi.mock("@xgamefi/shared/auth", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/auth")>();
  return { ...mod, requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: PLAYER, walletAddress: "GPLAYER" })), rateLimit: vi.fn(async () => true) };
});

describe("POST /referrals", () => {
  beforeEach(async () => {
    await prisma.referral.deleteMany(); await prisma.player.deleteMany();
    await prisma.player.create({ data: { id: PLAYER, walletAddress: "GPLAYER" } });
  });

  it("generates a code and returns the same code on repeat (idempotent)", async () => {
    const r1 = await POST(new Request("http://t", { method: "POST" }));
    const c1 = (await r1.json()).code;
    expect(c1).toMatch(/^[A-Z0-9]{6,}$/);
    const r2 = await POST(new Request("http://t", { method: "POST" }));
    expect((await r2.json()).code).toBe(c1);
    expect(await prisma.referral.count({ where: { referrerPlayerId: PLAYER, refereePlayerId: null } })).toBe(1);
  });

  it("GET /referrals/me reports performance counts", async () => {
    await POST(new Request("http://t", { method: "POST" }));
    const code = (await prisma.referral.findFirst({ where: { referrerPlayerId: PLAYER, refereePlayerId: null } }))!.code;
    await prisma.referral.create({ data: { code: code + "X", referrerPlayerId: PLAYER, refereePlayerId: "ref1", status: "REWARDED", rewardAmount: new Prisma.Decimal("0.5"), rewardCurrency: "USDT" } });
    await prisma.referral.create({ data: { code: code + "Y", referrerPlayerId: PLAYER, refereePlayerId: "ref2", status: "QUALIFIED" } });
    const res = await GET(new Request("http://t"));
    const b = await res.json();
    expect(b.qualified).toBe(1);
    expect(b.rewarded).toBe(1);
    expect(b.totalRewardAmount).toBe("0.5000000");
  });
});
```

```ts
// apps/web/app/api/v1/referrals/bind/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@xgamefi/db";

let CURRENT = "00000000-0000-0000-0000-0000000000c1"; // invitee
const REFERRER = "00000000-0000-0000-0000-0000000000a1";
vi.mock("@xgamefi/shared/auth", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/auth")>();
  return { ...mod, requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: CURRENT, walletAddress: "GINVITEE" })), rateLimit: vi.fn(async () => true) };
});
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

async function refCode() {
  await prisma.player.create({ data: { id: REFERRER, walletAddress: "GREF" } });
  const r = await prisma.referral.create({ data: { code: "ABC123", referrerPlayerId: REFERRER, refereePlayerId: null, status: "PENDING" } });
  return r.code;
}

describe("POST /referrals/bind", () => {
  beforeEach(async () => {
    CURRENT = "00000000-0000-0000-0000-0000000000c1";
    await prisma.referral.deleteMany(); await prisma.player.deleteMany();
    await prisma.player.create({ data: { id: CURRENT, walletAddress: "GINVITEE" } });
  });

  it("binds invitee to referrer and creates a PENDING per-invitee referral", async () => {
    const code = await refCode();
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code }) }));
    expect(res.status).toBe(200);
    const player = await prisma.player.findUnique({ where: { id: CURRENT } });
    expect(player?.referredByPlayerId).toBe(REFERRER);
    const inviteeRef = await prisma.referral.findFirst({ where: { refereePlayerId: CURRENT, status: "PENDING" } });
    expect(inviteeRef?.referrerPlayerId).toBe(REFERRER);
  });

  it("is a no-op when already bound", async () => {
    const code = await refCode();
    await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code }) }));
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code }) }));
    expect(res.status).toBe(200);
    expect(await prisma.referral.count({ where: { refereePlayerId: CURRENT } })).toBe(1);
  });

  it("rejects self-referral (referrer == invitee)", async () => {
    CURRENT = REFERRER;
    await prisma.player.create({ data: { id: REFERRER, walletAddress: "GREF" } });
    const r = await prisma.referral.create({ data: { code: "SELF12", referrerPlayerId: REFERRER, refereePlayerId: null, status: "PENDING" } });
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ code: r.code }) }));
    expect(res.status).toBe(409);
    expect(await prisma.player.findUnique({ where: { id: REFERRER } }).then(p => p?.referredByPlayerId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xgamefi/web test referrals`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Write the handlers**

```ts
// apps/web/app/api/v1/referrals/route.ts
import { randomBytes } from "node:crypto";
import { prisma } from "@xgamefi/db";
import { requirePrincipal, rateLimit } from "@xgamefi/shared/auth";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function genCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function POST() {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return json({ error: "forbidden" }, 403);
  if (!(await rateLimit(`ref:gen:${principal.playerId}`, 30, 60))) return json({ error: "rate_limited" }, 429);

  const existing = await prisma.referral.findFirst({
    where: { referrerPlayerId: principal.playerId, refereePlayerId: null },
  });
  if (existing) return json({ code: existing.code });

  // retry on the unique(code) collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      const row = await prisma.referral.create({
        data: { code, referrerPlayerId: principal.playerId, refereePlayerId: null, status: "PENDING" },
      });
      return json({ code: row.code });
    } catch {
      /* unique collision — retry */
    }
  }
  return json({ error: "code_generation_failed" }, 500);
}
```

```ts
// apps/web/app/api/v1/referrals/me/route.ts
import { prisma, Prisma } from "@xgamefi/db";
import { requirePrincipal, rateLimit } from "@xgamefi/shared/auth";
import { toReferralPerformanceDto } from "@xgamefi/shared/dto";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function GET() {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return json({ error: "forbidden" }, 403);
  if (!(await rateLimit(`ref:me:${principal.playerId}`, 60, 60))) return json({ error: "rate_limited" }, 429);

  const own = await prisma.referral.findFirst({
    where: { referrerPlayerId: principal.playerId, refereePlayerId: null },
  });
  const code = own?.code ?? "";

  const invitees = await prisma.referral.findMany({
    where: { referrerPlayerId: principal.playerId, refereePlayerId: { not: null } },
  });
  const total = invitees.length;
  const qualified = invitees.filter((r) => r.status === "QUALIFIED").length;
  const rewarded = invitees.filter((r) => r.status === "REWARDED").length;
  let totalReward = new Prisma.Decimal(0);
  let rewardCurrency: string | null = null;
  for (const r of invitees) {
    if (r.rewardAmount) totalReward = totalReward.plus(r.rewardAmount);
    if (r.rewardCurrency) rewardCurrency = r.rewardCurrency;
  }

  return json(toReferralPerformanceDto({ code, total, qualified, rewarded, totalRewardAmount: totalReward, rewardCurrency }));
}
```

```ts
// apps/web/app/api/v1/referrals/bind/route.ts
import { cookies } from "next/headers";
import { prisma } from "@xgamefi/db";
import { requirePrincipal, rateLimit } from "@xgamefi/shared/auth";
import { ReferralBindInput } from "@xgamefi/shared/zod";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request) {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") return json({ error: "forbidden" }, 403);
  if (!(await rateLimit(`ref:bind:${principal.playerId}`, 30, 60))) return json({ error: "rate_limited" }, 429);

  // Code from body, falling back to the xgf_ref cookie set at first visit.
  let code: string | undefined;
  try {
    const parsed = ReferralBindInput.safeParse(await req.json());
    if (parsed.success) code = parsed.data.code;
  } catch {
    /* no body */
  }
  if (!code) {
    const jar = await cookies();
    code = jar.get("xgf_ref")?.value;
  }
  if (!code) return json({ error: "no_referral_code" }, 400);

  const referrerRef = await prisma.referral.findFirst({
    where: { code, refereePlayerId: null },
  });
  if (!referrerRef) return json({ error: "invalid_code" }, 404);

  if (referrerRef.referrerPlayerId === principal.playerId) {
    return json({ error: "self_referral" }, 409);
  }

  const player = await prisma.player.findUnique({ where: { id: principal.playerId } });
  if (player?.referredByPlayerId) {
    return json({ ok: true, alreadyBound: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: principal.playerId },
      data: { referredByPlayerId: referrerRef.referrerPlayerId },
    });
    await tx.referral.create({
      data: {
        code: `${referrerRef.code}-${principal.playerId.slice(0, 8)}`,
        referrerPlayerId: referrerRef.referrerPlayerId,
        refereePlayerId: principal.playerId,
        status: "PENDING",
      },
    });
  });

  return json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @xgamefi/web test referrals`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/web exec tsc --noEmit
git add apps/web/app/api/v1/referrals
git commit -m "feat(web): referral generate/me/bind endpoints"
```

---

### Task 6: referral-reward worker job

**Files:**
- Create: `apps/worker/src/jobs/referral-reward/processor.ts`
- Create: `apps/worker/src/jobs/referral-reward/register.ts`
- Test: `apps/worker/src/jobs/referral-reward/processor.test.ts`
- Modify: `apps/worker/src/index.ts` (register the worker)
- Modify: `packages/shared/src/queues.ts` (add `referral-reward` to the queue-name union — the P0 registry stub already lists it per canonical interfaces; add only if missing)

**Interfaces:**
- Consumes: `prisma`, `Prisma` from `@xgamefi/db`; `sendPayment` from `@xgamefi/shared/stellar`; `toStellarAmount` from `@xgamefi/shared/money`; `registerWorker` from `@xgamefi/shared/queues`; `env` from `@xgamefi/config/env`.
- Produces:
  ```ts
  // apps/worker/src/jobs/referral-reward/processor.ts
  interface ReferralRewardJobData { referralId: string }
  async function referralRewardProcessor(job: { data: ReferralRewardJobData }): Promise<{ status: "REWARDED" | "SKIPPED"; txHash?: string }>;
  ```
  Behaviour: loads `Referral`; if `status !== "QUALIFIED"` returns `{ status: "SKIPPED" }` (idempotent — never double-pays on retry/replay); else computes the reward (fixed config from env `REFERRAL_REWARD_AMOUNT`/currency from the qualifying order), calls `sendPayment` to the referrer's wallet, then inside a `prisma.$transaction` flips `Referral` `QUALIFIED → REWARDED` (guarded by `updateMany where status=QUALIFIED` so a racing worker can't double-process) and writes `LedgerEntry(REFERRAL_REWARD)`.

> **Env note:** add `REFERRAL_REWARD_AMOUNT` (decimal string, default `"0.1"`) and `REFERRAL_REWARD_CURRENCY` (`XLM`|`USDT`, default the qualifying order's currency) to the `@xgamefi/config` env Zod schema. Reward currency falls back to the qualifying order's currency when unset.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/worker/src/jobs/referral-reward/processor.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const sendPayment = vi.fn(async () => ({ txHash: "REWARD_TX" }));
vi.mock("@xgamefi/shared/stellar", () => ({ sendPayment }));

import { referralRewardProcessor } from "./processor";

const REFERRER = "00000000-0000-0000-0000-0000000000a1";
const INVITEE = "00000000-0000-0000-0000-0000000000c1";
const STUDIO = "00000000-0000-0000-0000-000000000001";
const ITEM = "00000000-0000-0000-0000-0000000000d1";

async function seedQualified() {
  await prisma.player.createMany({ data: [
    { id: REFERRER, walletAddress: "GREFERRER" },
    { id: INVITEE, walletAddress: "GINVITEE" },
  ]});
  await prisma.studio.create({ data: { id: STUDIO, name: "G", slug: "g", payoutWalletAddress: "GP", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" } });
  await prisma.item.create({ data: { id: ITEM, studioId: STUDIO, externalId: "x", name: "X", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true } });
  const order = await prisma.order.create({ data: {
    studioId: STUDIO, itemId: ITEM, playerId: INVITEE, quantity: 1, currency: "USDT",
    grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
    platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
    idempotencyKey: "ord1", paymentStatus: "PAID", deliveryStatus: "DELIVERED",
  }});
  const ref = await prisma.referral.create({ data: {
    code: "ABC123-c1", referrerPlayerId: REFERRER, refereePlayerId: INVITEE,
    status: "QUALIFIED", qualifyingOrderId: order.id, qualifiedAt: new Date(),
  }});
  return ref.id;
}

describe("referralRewardProcessor", () => {
  beforeEach(async () => {
    sendPayment.mockClear();
    await prisma.ledgerEntry.deleteMany(); await prisma.referral.deleteMany();
    await prisma.order.deleteMany(); await prisma.item.deleteMany();
    await prisma.studio.deleteMany(); await prisma.player.deleteMany();
  });

  it("pays the referrer, ledgers REFERRAL_REWARD, sets status REWARDED", async () => {
    const referralId = await seedQualified();
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("REWARDED");
    expect(res.txHash).toBe("REWARD_TX");
    expect(sendPayment).toHaveBeenCalledTimes(1);
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GREFERRER" }));
    const ref = await prisma.referral.findUnique({ where: { id: referralId } });
    expect(ref?.status).toBe("REWARDED");
    expect(ref?.rewardTxHash).toBe("REWARD_TX");
    const ledger = await prisma.ledgerEntry.findFirst({ where: { type: "REFERRAL_REWARD", referralId } });
    expect(ledger?.destAddress).toBe("GREFERRER");
    expect(ledger?.stellarTxHash).toBe("REWARD_TX");
  });

  it("is idempotent: a second run skips and does NOT pay again", async () => {
    const referralId = await seedQualified();
    await referralRewardProcessor({ data: { referralId } });
    sendPayment.mockClear();
    const res = await referralRewardProcessor({ data: { referralId } });
    expect(res.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
    expect(await prisma.ledgerEntry.count({ where: { referralId } })).toBe(1);
  });

  it("skips a non-QUALIFIED referral (PENDING) without paying", async () => {
    await prisma.player.create({ data: { id: REFERRER, walletAddress: "GREFERRER" } });
    const ref = await prisma.referral.create({ data: { code: "PENDING1", referrerPlayerId: REFERRER, refereePlayerId: null, status: "PENDING" } });
    const res = await referralRewardProcessor({ data: { referralId: ref.id } });
    expect(res.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xgamefi/worker test referral-reward`
Expected: FAIL — `./processor` not found.

- [ ] **Step 3: Write the processor + registration**

```ts
// apps/worker/src/jobs/referral-reward/processor.ts
import { prisma, Prisma } from "@xgamefi/db";
import { sendPayment } from "@xgamefi/shared/stellar";
import { toStellarAmount } from "@xgamefi/shared/money";
import { env } from "@xgamefi/config/env";

export interface ReferralRewardJobData {
  referralId: string;
}

type Asset = { code: "XLM" } | { code: string; issuer: string };

function assetFor(currency: string): Asset {
  if (currency === "XLM") return { code: "XLM" };
  return { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };
}

export async function referralRewardProcessor(
  job: { data: ReferralRewardJobData },
): Promise<{ status: "REWARDED" | "SKIPPED"; txHash?: string }> {
  const { referralId } = job.data;

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { qualifyingOrder: true },
  });
  if (!referral || referral.status !== "QUALIFIED") return { status: "SKIPPED" };

  const referrer = await prisma.player.findUnique({ where: { id: referral.referrerPlayerId } });
  if (!referrer) return { status: "SKIPPED" };

  const rewardAmount = new Prisma.Decimal(env.REFERRAL_REWARD_AMOUNT);
  const rewardCurrency = env.REFERRAL_REWARD_CURRENCY ?? referral.qualifyingOrder?.currency ?? "XLM";
  const asset = assetFor(rewardCurrency);

  // Pay first; the txHash is captured before the status flip so a crash mid-flow
  // leaves status QUALIFIED for a safe retry (sendPayment must itself be idempotent
  // per AGENT.md §8 — keyed off referral status downstream).
  const { txHash } = await sendPayment({
    destination: referrer.walletAddress,
    asset,
    amount: toStellarAmount(rewardAmount),
    memo: `ref:${referralId.slice(0, 20)}`,
  });

  await prisma.$transaction(async (tx) => {
    // Guard: only flip if still QUALIFIED — defeats a racing duplicate worker.
    const flipped = await tx.referral.updateMany({
      where: { id: referralId, status: "QUALIFIED" },
      data: {
        status: "REWARDED",
        rewardAmount,
        rewardCurrency,
        rewardTxHash: txHash,
        rewardedAt: new Date(),
      },
    });
    if (flipped.count === 0) return; // another worker already rewarded
    await tx.ledgerEntry.create({
      data: {
        type: "REFERRAL_REWARD",
        referralId,
        stellarTxHash: txHash,
        sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
        destAddress: referrer.walletAddress,
        amount: rewardAmount,
        assetCode: rewardCurrency,
        assetIssuer: rewardCurrency === "XLM" ? null : env.STELLAR_USD_ASSET_ISSUER,
        status: "PAID",
      },
    });
  });

  return { status: "REWARDED", txHash };
}
```

```ts
// apps/worker/src/jobs/referral-reward/register.ts
import { registerWorker } from "@xgamefi/shared/queues";
import { referralRewardProcessor } from "./processor";

export function registerReferralRewardWorker() {
  return registerWorker("referral-reward", referralRewardProcessor);
}
```

Modify `apps/worker/src/index.ts` — add the registration alongside the existing workers:

```ts
// BEFORE (existing worker bootstrap)
import { registerPayoutWorker } from "./jobs/payout/register";
// ... existing registrations ...
registerPayoutWorker();
```

```ts
// AFTER
import { registerPayoutWorker } from "./jobs/payout/register";
import { registerReferralRewardWorker } from "./jobs/referral-reward/register";
// ... existing registrations ...
registerPayoutWorker();
registerReferralRewardWorker();
```

Add the env keys to `packages/config` env schema (if not already present):

```ts
// in @xgamefi/config env Zod schema object
  REFERRAL_REWARD_AMOUNT: z.string().regex(/^\d+(\.\d{1,7})?$/).default("0.1"),
  REFERRAL_REWARD_CURRENCY: z.enum(["XLM", "USDT"]).optional(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @xgamefi/worker test referral-reward`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/worker exec tsc --noEmit
git add apps/worker/src/jobs/referral-reward apps/worker/src/index.ts packages/config
git commit -m "feat(worker): idempotent referral-reward job paying referrer + ledger"
```

---

### Task 7: Hook referral qualification into Phase-3 verifyAndAdvanceOrder

**Files:**
- Modify: `packages/shared/src/settlement/verifyAndAdvanceOrder.ts` (Phase-3 file — modify, do NOT recreate)
- Test: `packages/shared/src/settlement/verifyAndAdvanceOrder.referral.test.ts` (new test for the referral hook)

**Interfaces:**
- Consumes (existing Phase-3): `verifyAndAdvanceOrder` already, inside its `prisma.$transaction`, on the first transition to `PAID` writes `LedgerEntry(SALE_IN)` and enqueues `payout` + `webhook-delivery` via `getQueue`. It loads the `order` row (has `playerId`, `studioId`).
- Consumes (new): `getQueue` from `@xgamefi/shared/queues` (already imported in the Phase-3 file).
- Produces: on the **first** PAID transition, if the order's player has a `Referral` with `refereePlayerId = playerId` and `status = PENDING` AND this is the player's first PAID order (the order being settled), flip that Referral to `QUALIFIED` (set `qualifyingOrderId` + `qualifiedAt`) inside the same transaction and enqueue `referral-reward` with `{ referralId }`. Idempotent: only the first-PAID branch runs this, and the Referral flip is guarded by `status = PENDING`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/settlement/verifyAndAdvanceOrder.referral.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const add = vi.fn(async () => {});
vi.mock("@xgamefi/shared/queues", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/queues")>();
  return { ...mod, getQueue: vi.fn(() => ({ add })) };
});
// verifyPayment is stubbed to succeed (the on-chain check is Phase-3's own concern).
vi.mock("@xgamefi/shared/stellar", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/stellar")>();
  return { ...mod, verifyPayment: vi.fn(async () => ({ ok: true, txHash: "TX1", amount: new Prisma.Decimal("1"), memo: "m", asset: { code: "USDT", issuer: "GISS" } })) };
});

import { verifyAndAdvanceOrder } from "./verifyAndAdvanceOrder";

const STUDIO = "00000000-0000-0000-0000-000000000001";
const ITEM = "00000000-0000-0000-0000-0000000000d1";
const REFERRER = "00000000-0000-0000-0000-0000000000a1";
const INVITEE = "00000000-0000-0000-0000-0000000000c1";

async function seed() {
  await prisma.player.createMany({ data: [
    { id: REFERRER, walletAddress: "GREF" }, { id: INVITEE, walletAddress: "GINV", referredByPlayerId: REFERRER },
  ]});
  await prisma.studio.create({ data: { id: STUDIO, name: "G", slug: "g", payoutWalletAddress: "GP", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" } });
  await prisma.item.create({ data: { id: ITEM, studioId: STUDIO, externalId: "x", name: "X", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true } });
  await prisma.referral.create({ data: { code: "ABC123-c1", referrerPlayerId: REFERRER, refereePlayerId: INVITEE, status: "PENDING" } });
  const order = await prisma.order.create({ data: {
    studioId: STUDIO, itemId: ITEM, playerId: INVITEE, quantity: 1, currency: "USDT",
    grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
    platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
    idempotencyKey: "ord1", paymentStatus: "PENDING", deliveryStatus: "PENDING",
  }});
  return order.id;
}

describe("verifyAndAdvanceOrder referral hook", () => {
  beforeEach(async () => {
    add.mockClear();
    await prisma.ledgerEntry.deleteMany(); await prisma.referral.deleteMany();
    await prisma.order.deleteMany(); await prisma.item.deleteMany();
    await prisma.studio.deleteMany(); await prisma.player.deleteMany();
  });

  it("on first PAID: marks referral QUALIFIED and enqueues referral-reward", async () => {
    const orderId = await seed();
    const res = await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    expect(res.status).toBe("PAID");
    const ref = await prisma.referral.findFirst({ where: { refereePlayerId: INVITEE } });
    expect(ref?.status).toBe("QUALIFIED");
    expect(ref?.qualifyingOrderId).toBe(orderId);
    expect(add).toHaveBeenCalledWith("referral-reward", { referralId: ref!.id }, expect.anything());
  });

  it("on a second PAID call (ALREADY): does not re-qualify or re-enqueue", async () => {
    const orderId = await seed();
    await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    add.mockClear();
    const res = await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    expect(res.status).toBe("ALREADY");
    const refRewardCalls = add.mock.calls.filter((c) => c[0] === "referral-reward");
    expect(refRewardCalls).toHaveLength(0);
  });

  it("no referral hook when the invitee was not referred", async () => {
    const orderId = await seed();
    await prisma.referral.deleteMany();
    await prisma.player.update({ where: { id: INVITEE }, data: { referredByPlayerId: null } });
    const res = await verifyAndAdvanceOrder({ orderId, txHash: "TX1" });
    expect(res.status).toBe("PAID");
    const refRewardCalls = add.mock.calls.filter((c) => c[0] === "referral-reward");
    expect(refRewardCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test verifyAndAdvanceOrder.referral`
Expected: FAIL — referral is not yet qualified / `referral-reward` not enqueued.

- [ ] **Step 3: Apply the exact edit inside the first-PAID branch**

BEFORE (the existing Phase-3 first-PAID branch, inside the `prisma.$transaction`, after the Order is flipped to PAID and `LedgerEntry(SALE_IN)` is written, where payout + webhook are enqueued):

```ts
      // --- Phase 3 (BEFORE) ---
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", stellarTxHash: txHash, paidAt: new Date() },
      });
      await tx.ledgerEntry.create({ data: { type: "SALE_IN", orderId: order.id, /* ...existing fields... */ } });

      await getQueue("payout").add("payout", { orderId: order.id }, { jobId: `payout:${order.id}` });
      await getQueue("webhook-delivery").add(
        "webhook-delivery",
        { orderId: order.id, event: "purchase.completed" },
        { jobId: `wh:${order.id}` },
      );
      return { status: "PAID" as const };
```

AFTER (add referral qualification before the `return`, still inside the transaction):

```ts
      // --- Phase 5 (AFTER) ---
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", stellarTxHash: txHash, paidAt: new Date() },
      });
      await tx.ledgerEntry.create({ data: { type: "SALE_IN", orderId: order.id, /* ...existing fields... */ } });

      await getQueue("payout").add("payout", { orderId: order.id }, { jobId: `payout:${order.id}` });
      await getQueue("webhook-delivery").add(
        "webhook-delivery",
        { orderId: order.id, event: "purchase.completed" },
        { jobId: `wh:${order.id}` },
      );

      // Referral qualification — only on the invitee's FIRST qualifying (PAID) purchase.
      // This branch runs only on the first PAID transition, so it is inherently once-per-order.
      const priorPaid = await tx.order.count({
        where: { playerId: order.playerId, paymentStatus: "PAID", id: { not: order.id } },
      });
      if (priorPaid === 0) {
        const pendingReferral = await tx.referral.findFirst({
          where: { refereePlayerId: order.playerId, status: "PENDING" },
        });
        if (pendingReferral) {
          const flipped = await tx.referral.updateMany({
            where: { id: pendingReferral.id, status: "PENDING" },
            data: { status: "QUALIFIED", qualifyingOrderId: order.id, qualifiedAt: new Date() },
          });
          if (flipped.count === 1) {
            await getQueue("referral-reward").add(
              "referral-reward",
              { referralId: pendingReferral.id },
              { jobId: `ref:${pendingReferral.id}` },
            );
          }
        }
      }

      return { status: "PAID" as const };
```

(The `jobId` keys make the enqueue itself idempotent at the BullMQ layer; the `referral-reward` processor’s `status=QUALIFIED` guard is the authoritative double-pay defense.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test verifyAndAdvanceOrder`
Expected: PASS (referral hook tests + existing Phase-3 settlement tests green).

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/shared exec tsc --noEmit
git add packages/shared/src/settlement
git commit -m "feat(shared): qualify referral + enqueue reward on first PAID order"
```

---

### Task 8: Player referrals page `/s/[slug]/referrals`

**Files:**
- Create: `apps/web/app/(storefront)/s/[slug]/referrals/page.tsx`
- Create: `apps/web/app/(storefront)/s/[slug]/referrals/ReferralPanel.tsx` (client island)
- Test: `apps/web/app/(storefront)/s/[slug]/referrals/ReferralPanel.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/referrals` and `GET /api/v1/referrals/me`; `env.APP_BASE_URL` for building the share link; `qrcode` for the share QR; BRAND tokens (`bg-surface-container-low border-2 border-outline-variant`, lime `primary-fixed` accents, mono uppercase labels).
- Produces: a player-facing page (Server Component shell + client island) that generates/returns the code, builds a share link `${APP_BASE_URL}/s/${slug}?ref=${code}`, renders a QR, and shows performance (`total`/`qualified`/`rewarded`/`totalRewardAmount`).

- [ ] **Step 1: Write the failing client-island test**

```tsx
// apps/web/app/(storefront)/s/[slug]/referrals/ReferralPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReferralPanel } from "./ReferralPanel";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/api/v1/referrals") && init?.method === "POST") {
      return new Response(JSON.stringify({ code: "ABC123" }), { status: 200 });
    }
    if (String(url).endsWith("/api/v1/referrals/me")) {
      return new Response(JSON.stringify({ code: "ABC123", total: 3, qualified: 2, rewarded: 1, totalRewardAmount: "0.5000000", rewardCurrency: "USDT" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
});

describe("ReferralPanel", () => {
  it("renders the share link with the generated code and performance counts", async () => {
    render(<ReferralPanel slug="gridlock" appBaseUrl="https://app.test" />);
    await waitFor(() => expect(screen.getByText(/ABC123/)).toBeInTheDocument());
    expect(screen.getByText(/https:\/\/app\.test\/s\/gridlock\?ref=ABC123/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument()); // qualified
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test ReferralPanel`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the page + client island**

```tsx
// apps/web/app/(storefront)/s/[slug]/referrals/ReferralPanel.tsx
"use client";
import { useEffect, useState } from "react";

interface Performance { code: string; total: number; qualified: number; rewarded: number; totalRewardAmount: string; rewardCurrency: string | null; }

export function ReferralPanel({ slug, appBaseUrl }: { slug: string; appBaseUrl: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);

  useEffect(() => {
    (async () => {
      const gen = await fetch("/api/v1/referrals", { method: "POST" });
      const { code } = await gen.json();
      setCode(code);
      const me = await fetch("/api/v1/referrals/me");
      setPerf(await me.json());
    })();
  }, []);

  const shareLink = code ? `${appBaseUrl}/s/${slug}?ref=${code}` : "";

  return (
    <section className="bg-surface-container-low border-2 border-outline-variant p-6 space-y-6">
      <h2 className="font-mono uppercase tracking-[0.1em] text-on-surface-variant text-xs">REFERRAL_PROGRAM</h2>
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-outline">YOUR CODE</p>
        <p className="text-2xl text-primary-fixed font-display">{code ?? "…"}</p>
        <p className="break-all text-on-surface-variant text-sm">{shareLink}</p>
      </div>
      {perf && (
        <dl className="grid grid-cols-3 gap-4">
          <div><dt className="font-mono text-xs uppercase text-outline">INVITED</dt><dd className="text-primary-fixed text-xl">{perf.total}</dd></div>
          <div><dt className="font-mono text-xs uppercase text-outline">QUALIFIED</dt><dd className="text-primary-fixed text-xl">{perf.qualified}</dd></div>
          <div><dt className="font-mono text-xs uppercase text-outline">REWARDED</dt><dd className="text-primary-fixed text-xl">{perf.rewarded}</dd></div>
        </dl>
      )}
    </section>
  );
}
```

```tsx
// apps/web/app/(storefront)/s/[slug]/referrals/page.tsx
import { env } from "@xgamefi/config/env";
import { ReferralPanel } from "./ReferralPanel";

export default async function ReferralsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="max-w-[1440px] mx-auto px-5 md:px-16 py-10">
      <h1 className="font-display text-4xl mb-6 italic">Refer &amp; Earn</h1>
      <ReferralPanel slug={slug} appBaseUrl={env.APP_BASE_URL} />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test ReferralPanel`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/web exec tsc --noEmit
git add "apps/web/app/(storefront)/s/[slug]/referrals"
git commit -m "feat(web): player referral page (generate/share/status)"
```

---

### Task 9: Studio dashboard pages — promotions + referrals

**Files:**
- Create: `apps/web/app/(studio)/dashboard/promotions/page.tsx`
- Create: `apps/web/app/(studio)/dashboard/promotions/PromotionsManager.tsx` (client island)
- Create: `apps/web/app/(studio)/dashboard/referrals/page.tsx`
- Test: `apps/web/app/(studio)/dashboard/promotions/PromotionsManager.test.tsx`

**Interfaces:**
- Consumes: `requireRole("STUDIO_OWNER","STUDIO_MEMBER","ADMIN")` + `getPrincipal` from `@xgamefi/shared/auth` (resolve current `studioId`); `prisma` for server-side initial fetch (scoped by `studioId`); `toPromotionDto`, `toReferralDto` from `@xgamefi/shared/dto`; the promotion CRUD endpoints from Task 3; for referrals page, aggregates studio referrals (`Referral.studioId`) and their payouts (`LedgerEntry` type `REFERRAL_REWARD`).
- Produces: `/dashboard/promotions` lists/creates/edits/deletes promotions via the Task-3 API; `/dashboard/referrals` renders referral performance + payout history for the studio.

- [ ] **Step 1: Write the failing client-island test**

```tsx
// apps/web/app/(studio)/dashboard/promotions/PromotionsManager.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromotionsManager } from "./PromotionsManager";

const initial = [{ id: "p1", name: "Launch", type: "PERCENT", value: "10.0000000", currency: null, appliesToItemIds: [], bundleConfig: null, startsAt: null, endsAt: null, usageLimit: null, usageCount: 0, isActive: true, createdAt: "2026-06-23T00:00:00.000Z", updatedAt: "2026-06-23T00:00:00.000Z" }];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ promotion: { ...initial[0], id: "p2", name: "Summer", value: "20.0000000" } }), { status: 201 }),
  ));
});

describe("PromotionsManager", () => {
  it("lists existing promotions and shows their type + value", async () => {
    render(<PromotionsManager studioId="s1" initial={initial} />);
    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByText("PERCENT")).toBeInTheDocument();
    expect(screen.getByText(/10\.0000000/)).toBeInTheDocument();
  });

  it("creates a promotion via the API and appends it to the list", async () => {
    render(<PromotionsManager studioId="s1" initial={initial} />);
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Summer" } });
    fireEvent.change(screen.getByLabelText("value"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /create promotion/i }));
    await waitFor(() => expect(screen.getByText("Summer")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/v1/studios/s1/promotions", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test PromotionsManager`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the pages + manager island**

```tsx
// apps/web/app/(studio)/dashboard/promotions/PromotionsManager.tsx
"use client";
import { useState } from "react";

interface PromotionDto { id: string; name: string; type: string; value: string; currency: string | null; isActive: boolean; usageCount: number; }

export function PromotionsManager({ studioId, initial }: { studioId: string; initial: PromotionDto[] }) {
  const [promos, setPromos] = useState<PromotionDto[]>(initial);
  const [name, setName] = useState("");
  const [type, setType] = useState("PERCENT");
  const [value, setValue] = useState("");

  async function create() {
    const res = await fetch(`/api/v1/studios/${studioId}/promotions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type, value }),
    });
    if (res.ok) {
      const { promotion } = await res.json();
      setPromos((p) => [promotion, ...p]);
      setName(""); setValue("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container border-2 border-outline-variant p-4 grid gap-3 md:grid-cols-4 items-end">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          NAME
          <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-transparent border-b-2 border-outline focus:border-primary-fixed text-on-surface px-1 py-1" />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          TYPE
          <select aria-label="type" value={type} onChange={(e) => setType(e.target.value)} className="bg-surface-container-high text-on-surface px-1 py-1">
            <option value="PERCENT">PERCENT</option>
            <option value="FIXED">FIXED</option>
            <option value="BUNDLE">BUNDLE</option>
            <option value="FIRST_PURCHASE">FIRST_PURCHASE</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.1em] text-outline">
          VALUE
          <input aria-label="value" value={value} onChange={(e) => setValue(e.target.value)} className="bg-transparent border-b-2 border-outline focus:border-primary-fixed text-on-surface px-1 py-1" />
        </label>
        <button onClick={create} className="bg-primary-fixed text-on-primary-fixed font-mono uppercase tracking-[0.1em] px-4 py-2 active:scale-95">CREATE PROMOTION</button>
      </div>
      <ul className="space-y-2">
        {promos.map((p) => (
          <li key={p.id} className="bg-surface-container-low border-2 border-outline-variant p-3 flex justify-between">
            <span className="text-on-surface">{p.name}</span>
            <span className="font-mono text-xs uppercase text-tertiary-fixed-dim">{p.type}</span>
            <span className="text-primary-fixed font-mono">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// apps/web/app/(studio)/dashboard/promotions/page.tsx
import { getPrincipal, requireRole } from "@xgamefi/shared/auth";
import { prisma } from "@xgamefi/db";
import { toPromotionDto } from "@xgamefi/shared/dto";
import { PromotionsManager } from "./PromotionsManager";

export default async function PromotionsPage() {
  await requireRole("STUDIO_OWNER", "STUDIO_MEMBER", "ADMIN");
  const principal = await getPrincipal();
  const studioId = principal && principal.kind === "user" ? principal.studioId! : "";
  const rows = await prisma.promotion.findMany({ where: { studioId }, orderBy: { createdAt: "desc" } });
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl mb-6">Promotions</h1>
      <PromotionsManager studioId={studioId} initial={rows.map(toPromotionDto)} />
    </main>
  );
}
```

```tsx
// apps/web/app/(studio)/dashboard/referrals/page.tsx
import { getPrincipal, requireRole } from "@xgamefi/shared/auth";
import { prisma } from "@xgamefi/db";
import { toReferralDto } from "@xgamefi/shared/dto";

export default async function StudioReferralsPage() {
  await requireRole("STUDIO_OWNER", "STUDIO_MEMBER", "ADMIN");
  const principal = await getPrincipal();
  const studioId = principal && principal.kind === "user" ? principal.studioId! : "";
  const referrals = await prisma.referral.findMany({
    where: { studioId, refereePlayerId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  const payouts = await prisma.ledgerEntry.findMany({
    where: { type: "REFERRAL_REWARD", referral: { studioId } },
    orderBy: { createdAt: "desc" },
  });
  const dtos = referrals.map(toReferralDto);
  return (
    <main className="p-8 space-y-8">
      <h1 className="font-display text-3xl">Referrals</h1>
      <section>
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-outline mb-3">REFERRAL_ACTIVITY</h2>
        <ul className="space-y-2">
          {dtos.map((r) => (
            <li key={r.id} className="bg-surface-container-low border-2 border-outline-variant p-3 flex justify-between">
              <span className="font-mono text-on-surface">{r.code}</span>
              <span className="font-mono text-xs uppercase text-tertiary-fixed-dim">{r.status}</span>
              <span className="text-primary-fixed font-mono">{r.rewardAmount ?? "—"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-outline mb-3">PAYOUTS</h2>
        <ul className="space-y-2">
          {payouts.map((p) => (
            <li key={p.id} className="bg-surface-container-low border-2 border-outline-variant p-3 flex justify-between font-mono text-sm">
              <span className="text-on-surface-variant">{p.destAddress}</span>
              <span className="text-primary-fixed">{p.amount.toFixed(7)} {p.assetCode}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

> **Note:** the studio-scoped referral query relies on `Referral.studioId` being populated. Ensure the bind handler (Task 5) sets `studioId` on the per-invitee `Referral` from the storefront context when bind occurs on a studio page — extend the `tx.referral.create` data in Task 5 with `studioId` when the slug is known (acceptable refinement if the bind page passes the studio). For the demo, the dashboard query also tolerates `studioId = null` referrals by additionally listing referrals whose `qualifyingOrder.studioId = studioId`; if you prefer the simpler model, set `studioId` at qualification time in Task 7 (`data: { ..., studioId: order.studioId }`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test PromotionsManager`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @xgamefi/web exec tsc --noEmit
git add "apps/web/app/(studio)/dashboard/promotions" "apps/web/app/(studio)/dashboard/referrals"
git commit -m "feat(web): studio promotions manager + referrals dashboard pages"
```

---

### Task 10: Acceptance integration test — discounted order + auto referral payout, both ledgered

**Files:**
- Create: `apps/web/test/acceptance/phase5-growth.test.ts`

**Interfaces:**
- Consumes: the full Phase-5 surface — `POST /checkout/quote` (Task 4) with a promotion, `verifyAndAdvanceOrder` (Task 7), `referralRewardProcessor` (Task 6). `sendPayment` stubbed; `verifyPayment` stubbed to succeed.
- Produces: the acceptance gate — a discounted order computes correct discount+fee server-side; the invitee's first purchase auto-pays the referrer; both are ledgered (`SALE_IN` + `REFERRAL_REWARD`).

- [ ] **Step 1: Write the failing acceptance test**

```ts
// apps/web/test/acceptance/phase5-growth.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";

const sendPayment = vi.fn(async () => ({ txHash: "REWARD_TX" }));
vi.mock("@xgamefi/shared/stellar", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/stellar")>();
  return {
    ...mod,
    sendPayment,
    verifyPayment: vi.fn(async () => ({ ok: true, txHash: "SALE_TX", amount: new Prisma.Decimal("0.9"), memo: "m", asset: { code: "USDT", issuer: "GISS" } })),
  };
});
const add = vi.fn(async () => {});
vi.mock("@xgamefi/shared/queues", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/queues")>();
  return { ...mod, getQueue: vi.fn(() => ({ add })) };
});
vi.mock("@xgamefi/shared/auth", async (orig) => {
  const mod = await orig<typeof import("@xgamefi/shared/auth")>();
  return { ...mod, requirePrincipal: vi.fn(async () => ({ kind: "player", playerId: INVITEE, walletAddress: "GINV" })), rateLimit: vi.fn(async () => true) };
});

import { POST as quote } from "../../app/api/v1/checkout/quote/route";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { referralRewardProcessor } from "../../../worker/src/jobs/referral-reward/processor";

const STUDIO = "00000000-0000-0000-0000-000000000001";
const ITEM = "00000000-0000-0000-0000-0000000000d1";
const REFERRER = "00000000-0000-0000-0000-0000000000a1";
const INVITEE = "00000000-0000-0000-0000-0000000000c1";

describe("Phase 5 acceptance: discounted order + auto referral payout", () => {
  beforeEach(async () => {
    add.mockClear(); sendPayment.mockClear();
    await prisma.ledgerEntry.deleteMany(); await prisma.referral.deleteMany();
    await prisma.order.deleteMany(); await prisma.promotion.deleteMany();
    await prisma.item.deleteMany(); await prisma.studio.deleteMany(); await prisma.player.deleteMany();
    await prisma.player.createMany({ data: [
      { id: REFERRER, walletAddress: "GREFERRER" },
      { id: INVITEE, walletAddress: "GINV", referredByPlayerId: REFERRER },
    ]});
    await prisma.studio.create({ data: { id: STUDIO, name: "G", slug: "gridlock", payoutWalletAddress: "GP", webhookSecretHash: "h", platformFeeBps: 500, status: "ACTIVE" } });
    await prisma.item.create({ data: { id: ITEM, studioId: STUDIO, externalId: "sword", name: "Sword", priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", isActive: true } });
    await prisma.promotion.create({ data: { studioId: STUDIO, name: "Launch", type: "PERCENT", value: new Prisma.Decimal("10"), appliesToItemIds: [], usageCount: 0, isActive: true } });
    await prisma.referral.create({ data: { code: "ABC123-c1", studioId: STUDIO, referrerPlayerId: REFERRER, refereePlayerId: INVITEE, status: "PENDING" } });
  });

  it("end-to-end: 10% discount applied server-side, referrer auto-paid, both ledgered", async () => {
    // 1) Quote applies the 10% promo: gross 1.0, discount 0.1, fee 5% of 0.9 = 0.045, net 0.855
    const qres = await quote(new Request("http://t/api/v1/checkout/quote", {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ slug: "gridlock", itemId: ITEM, qty: 1 }),
    }));
    const q = await qres.json();
    expect(q.discountAmount).toBe("0.1000000");
    expect(q.platformFeeAmount).toBe("0.0450000");
    expect(q.netToStudioAmount).toBe("0.8550000");
    const order = await prisma.order.findFirst();
    expect(order?.discountAmount?.toFixed(7)).toBe("0.1000000");
    expect(order?.promotionId).toBeTruthy();

    // 2) Settle the order PAID -> qualifies referral + enqueues referral-reward + SALE_IN ledger
    const settle = await verifyAndAdvanceOrder({ orderId: order!.id, txHash: "SALE_TX" });
    expect(settle.status).toBe("PAID");
    const ref = await prisma.referral.findFirst({ where: { refereePlayerId: INVITEE } });
    expect(ref?.status).toBe("QUALIFIED");
    expect(add).toHaveBeenCalledWith("referral-reward", { referralId: ref!.id }, expect.anything());
    expect(await prisma.ledgerEntry.count({ where: { type: "SALE_IN", orderId: order!.id } })).toBe(1);

    // 3) Run the reward job -> referrer paid, REWARDED, REFERRAL_REWARD ledger
    const reward = await referralRewardProcessor({ data: { referralId: ref!.id } });
    expect(reward.status).toBe("REWARDED");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GREFERRER" }));
    const rewarded = await prisma.referral.findUnique({ where: { id: ref!.id } });
    expect(rewarded?.status).toBe("REWARDED");
    expect(await prisma.ledgerEntry.count({ where: { type: "REFERRAL_REWARD", referralId: ref!.id } })).toBe(1);

    // 4) Idempotency: re-running the reward job does not double-pay
    sendPayment.mockClear();
    const again = await referralRewardProcessor({ data: { referralId: ref!.id } });
    expect(again.status).toBe("SKIPPED");
    expect(sendPayment).not.toHaveBeenCalled();
    expect(await prisma.ledgerEntry.count({ where: { type: "REFERRAL_REWARD", referralId: ref!.id } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (then passes once all prior tasks land)**

Run: `pnpm --filter @xgamefi/web test phase5-growth`
Expected: initially FAIL if any prior task incomplete; PASS once Tasks 1–7 are implemented.

- [ ] **Step 3: No new implementation**

This task adds no production code — it is the cross-cutting acceptance gate over Tasks 1–7. If it fails, fix the responsible task rather than patching here.

- [ ] **Step 4: Run the full Phase-5 suite**

Run: `pnpm --filter @xgamefi/shared test && pnpm --filter @xgamefi/worker test && pnpm --filter @xgamefi/web test`
Expected: PASS across promotions, referrals, settlement hook, reward job, and acceptance.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/acceptance/phase5-growth.test.ts
git commit -m "test(web): phase 5 acceptance — discounted order + auto referral payout, both ledgered"
```

---

## Self-Review

**1. Spec coverage**

- §8.5 PERCENT / FIXED / BUNDLE / FIRST_PURCHASE — Task 1 (`applyPromotion`) covers all four with tests; FIRST_PURCHASE gating via `playerHasPaidOrder`. ✔
- §8.5 startsAt/endsAt, usageLimit/usageCount, appliesToItemIds — Task 1 eligibility + tests. ✔
- §8.5 applied at quote time; fee on discounted; discount recorded on Order; never recomputed client-side — Task 4 edit to Phase-3 quote. ✔
- §7 `GET/POST /studios/:id/promotions`, `PATCH/DELETE /studios/:id/promotions/:promoId` — Task 3 with tenant isolation tests. ✔
- §6 `/dashboard/promotions` — Task 9. ✔
- §8.4 / §7 `POST /referrals`, `GET /referrals/me`, `POST /referrals/bind` — Task 5 with tests. ✔
- §8.4 qualify on first purchase + enqueue reward — Task 7 edit to `verifyAndAdvanceOrder`. ✔
- §9 `referral-reward` job: pay referrer (sendPayment), LedgerEntry(REFERRAL_REWARD), status REWARDED, idempotent on status — Task 6. ✔
- §6 `/s/[slug]/referrals` player page — Task 8; `/dashboard/referrals` studio page — Task 9. ✔
- Acceptance gate (discount+fee server-side; first purchase auto-pays referrer; both ledgered) — Task 10. ✔

**2. Placeholder scan**

- No "TBD"/"TODO"/"implement later"/"add validation" left. The Task 9 `studioId`-on-Referral note is an explicit refinement with two concrete options (set `studioId` at bind or at qualification), not a placeholder — to remove ambiguity, the canonical choice is: set `studioId: order.studioId` in the Task 7 `tx.referral.updateMany` data so the dashboard query (`where: { studioId }`) is exact. Adopt that line in Task 7's edit (`data: { status: "QUALIFIED", qualifyingOrderId: order.id, qualifiedAt: new Date(), studioId: order.studioId }`).
- All code steps contain full code; all run-commands have expected output. ✔

**3. Type consistency**

- `applyPromotion` `PromotionInput`/`ApplyPromotionArgs`/`ApplyPromotionResult` defined in Task 1 and consumed verbatim in Task 4. ✔
- `toPromotionDto`/`toReferralDto`/`toReferralPerformanceDto` defined in Task 2, consumed in Tasks 3, 5, 9. ✔
- `verifyAndAdvanceOrder({ orderId, txHash })` return `{ status: "PAID"|"ALREADY"|"REJECTED" }` matches canonical interface (P3) and Task 7/10 usage. ✔
- `sendPayment(args): Promise<{ txHash }>`, `feeAmount`/`netAmount`/`toStellarAmount`, `getQueue`/`registerWorker`, `requireStudio`/`requirePrincipal`/`scopeToStudio` all used with their canonical signatures. ✔
- `referralRewardProcessor({ data: { referralId } })` consistent between Task 6 definition and Tasks 7 (enqueue payload `{ referralId }`) and 10. ✔
- Money everywhere is `Prisma.Decimal` formatted via `toStellarAmount` (7dp); rounding floored in `applyPromotion`. ✔

Fix applied inline: Task 7's referral `updateMany` data includes `studioId: order.studioId` so studio-scoped dashboard queries in Task 9 are exact (resolves the only ambiguity flagged above).
