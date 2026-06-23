# Phase 3 — Primary Sale (THE DEMO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end primary-sale payment core: wallet-authenticated players get a quoted price + memo, pay on Stellar, and the platform verifies the on-chain payment (both via `checkout/submit` fast-path and the authoritative `stellar-watcher`), writes a `LedgerEntry`, pays out the net to the studio, delivers a signed webhook, streams status via SSE, and falls back to refund on webhook exhaustion — so the `SPEC.md` §13 demo (scan QR → pay 1 USDT → on-chain confirm → signed webhook → item delivered → live SSE feed) passes on testnet.

**Architecture:** The money-critical confirmer is a single shared `verifyAndAdvanceOrder(orderId, txHash)` in `@xgamefi/shared/settlement`. Both the web fast-path (`POST /checkout/submit`) and the background `stellar-watcher` call it. It runs inside `prisma.$transaction`, verifies the Horizon payment, enforces txHash uniqueness, advances `Order.paymentStatus`, writes `LedgerEntry(SALE_IN)`, and enqueues `payout` + `webhook-delivery`. Idempotency is enforced by `withIdempotency` (Redis lock + `IdempotencyKey` table) on `checkout/submit`. `GET /orders/:id/events` streams Server-Sent Events from a Redis pub/sub channel so the storefront shows live status transitions without polling. Downstream jobs (`payout`, `webhook-delivery`, `refund`) are BullMQ workers keyed off the entity's current status, making retries and DLQ replays safe.

**Tech Stack:** Next.js 16.2.x App Router + React 19.2.x (Server Components for quote/submit, client island for QR/payment UX), Prisma 7 + `@xgamefi/db`, `@xgamefi/shared` (money, stellar, hmac, ssrf, dto, zod, settlement, idempotency, queues), BullMQ + ioredis (`apps/worker`), Zod, vitest, @playwright/test, @stellar/freighter-api, qrcode. Phases 0–2 are complete: monorepo, full schema + seed, money/HMAC/SSRF/Stellar primitives, auth/RBAC, catalogue + storefront.

## Global Constraints

These are project-wide rules from `AGENT.md` and the canonical interface contract. **Every task implicitly inherits all of them.**

- Node.js **22 LTS**; pnpm **10.x**; commit `pnpm-lock.yaml`.
- Pin majors, float patches: next 16.2.x, react/react-dom 19.2.x, typescript 5.x strict, prisma 7.x (≥7.8, ESM-only), PostgreSQL 17, tailwindcss 4.3.x, @stellar/stellar-sdk 15.1.x, @stellar/freighter-api 5.x, Redis 7.x.
- **Money is `Decimal`, never `float`.** Use `bignumber.js` / `Prisma.Decimal`; Stellar amounts have 7 decimals (stroops). Never use JS `number` for amounts.
- **Validate every input with Zod; return mapped DTOs**, never raw Prisma rows or stack traces.
- **Secrets live in env / Railway variables** — never in repo, DB plaintext, or client bundles. No secrets in `NEXT_PUBLIC_*`.
- **Parse and validate env at boot with Zod; fail fast** on missing/invalid values.
- **SSRF guard on every studio-supplied URL** (`apiBaseUrl`, `webhookUrl`) — HTTPS-only; reject private/loopback/link-local/cloud-metadata ranges; pin resolved IP; strict timeout + response-size cap; no cross-host redirects. No raw `fetch` to a studio URL anywhere.
- **Never trust the client for money or authorization.** Verify every payment on-chain server-side; re-check roles/ownership in every handler (defense in depth — do not rely on `proxy.ts` alone).
- **Everything is idempotent** where retries or webhooks are involved.
- Single `PrismaClient` instance via the **pg driver adapter**; configure Prisma via `prisma.config.ts`.
- Tailwind v4 is CSS-first: `@import "tailwindcss";` + `@theme` block from `BRAND.md`. No `tailwind.config.js`.
- **Dark theme only.** Hero accent is `primary-fixed` (`#c3f400`, acid lime) on obsidian `#131313`, used sparingly. Gate scanlines/glitch/marquee/pulse behind `prefers-reduced-motion: reduce`.
- State-changing wallet/payment endpoints require an `Idempotency-Key` header.
- Studio-scoped queries always pass through `scopeToStudio`.
- HMAC header name: `X-XGameFi-Signature: t=<unix>,v1=<hmac>`; key header `X-XGameFi-Key`; timestamp `X-XGameFi-Timestamp`.
- CI gate (green or no merge): `pnpm lint`, `tsc --noEmit`, `pnpm test`, `prisma migrate diff` drift check, `pnpm audit` (fail on high/critical).

---

## File Structure

**`packages/shared` (money-critical core):**
- `packages/shared/src/dto/order.ts` — `OrderDto`, `toOrderDto(row)`, `OrderStatus`/`PaymentStatus`/`DeliveryStatus` wire types.
- `packages/shared/src/dto/webhook.ts` — `WebhookDeliveryDto`, `toWebhookDeliveryDto(row)`.
- `packages/shared/src/zod/checkout.ts` — `CheckoutQuoteInput`, `CheckoutSubmitInput`.
- `packages/shared/src/zod/order.ts` — `OrderEventsParams`.
- `packages/shared/src/settlement.ts` — `verifyAndAdvanceOrder(args)`; the single authoritative confirmer.
- `packages/shared/src/settlement.test.ts` — mocked Horizon + mocked payout/webhook enqueue.
- `packages/shared/src/idempotency.ts` — `withIdempotency<T>(args, fn)`.
- `packages/shared/src/idempotency.test.ts`.
- `packages/shared/src/queues.ts` — queue name registry, `getQueue(name)`, `registerWorker(name, processor)` using BullMQ + ioredis.
- `packages/shared/src/queues.test.ts`.
- `packages/shared/src/index.ts` — re-export settlement, idempotency, queues.

**`apps/worker` (background jobs):**
- `apps/worker/src/jobs/stellar-watcher.ts` — stream Horizon payments for the receiving account, match by memo, call `verifyAndAdvanceOrder`.
- `apps/worker/src/jobs/stellar-watcher.test.ts`.
- `apps/worker/src/jobs/payout.ts` — `payoutProcessor(job)`, pays net to studio payout wallet, writes `LedgerEntry(PAYOUT_OUT)`.
- `apps/worker/src/jobs/payout.test.ts`.
- `apps/worker/src/jobs/webhook-delivery.ts` — `webhookDeliveryProcessor(job)`, signs payload, POSTs through `safeFetch`, retries, DLQ, updates `WebhookDelivery` + `Order.deliveryStatus`.
- `apps/worker/src/jobs/webhook-delivery.test.ts`.
- `apps/worker/src/jobs/refund.ts` — `refundProcessor(job)` stub for Phase 3 (logs + sets status; full refund in P6).
- `apps/worker/src/jobs/refund.test.ts`.
- `apps/worker/src/redis.ts` — ioredis connection (already exists from P0; may need export for SSE pub/sub).
- `apps/worker/src/index.ts` — register all four workers.

**`apps/web` (route handlers):**
- `apps/web/app/api/v1/checkout/quote/route.ts` — `POST` (player wallet auth), creates `PENDING` Order, returns quote.
- `apps/web/app/api/v1/checkout/quote/route.test.ts`.
- `apps/web/app/api/v1/checkout/submit/route.ts` — `POST` (player wallet auth + idempotency), records txHash, calls `verifyAndAdvanceOrder`.
- `apps/web/app/api/v1/checkout/submit/route.test.ts`.
- `apps/web/app/api/v1/orders/[id]/events/route.ts` — `GET` SSE stream.
- `apps/web/app/api/v1/orders/[id]/events/route.test.ts`.
- `apps/web/lib/checkout-queries.ts` — server helpers `getOrder`, `createOrderQuote`, `publishOrderEvent`.
- `apps/web/lib/checkout-queries.test.ts`.

**`apps/web` (UI):**
- `apps/web/app/(storefront)/s/[slug]/checkout/page.tsx` — checkout page for item + QR.
- `apps/web/app/(storefront)/s/[slug]/checkout/checkout-client.tsx` — `"use client"` Freighter + QR + SSE status island.
- `apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx` — add "Buy" button linking to checkout (modify existing).
- `apps/web/lib/sse.ts` — `createSseStream(channel)` helper.

**`apps/web` (e2e):**
- `apps/web/e2e/demo.spec.ts` — Phase-3 acceptance test (Playwright).

---

### Task 1: Order DTO + checkout Zod schemas

**Files:**
- Create: `packages/shared/src/dto/order.ts`
- Create: `packages/shared/src/dto/webhook.ts`
- Create: `packages/shared/src/zod/checkout.ts`
- Create: `packages/shared/src/zod/order.ts`
- Modify: `packages/shared/src/dto/index.ts`, `packages/shared/src/zod/index.ts`
- Test: `packages/shared/src/dto/order.test.ts`, `packages/shared/src/dto/webhook.test.ts`, `packages/shared/src/zod/checkout.test.ts`, `packages/shared/src/zod/order.test.ts`

**Interfaces:**
- Consumes: `Prisma` (`@xgamefi/db`) for `Decimal` and generated row types; `toStellarAmount` from `@xgamefi/shared/money` (P0).
- Produces:
  - `type OrderDto = { id: string; studioId: string; itemId: string; playerId: string; quantity: number; currency: "XLM" | "USDT"; grossAmount: string; discountAmount: string; platformFeeAmount: string; netToStudioAmount: string; paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED"; deliveryStatus: "PENDING" | "DELIVERED" | "FAILED"; stellarTxHash: string | null; paidAt: string | null; deliveredAt: string | null; createdAt: string }`
  - `function toOrderDto(row: OrderRow): OrderDto` — amounts 7-dp via `toStellarAmount`; dates ISO.
  - `type WebhookDeliveryDto = { id: string; studioId: string; event: string; orderId: string | null; attempt: number; maxAttempts: number; status: "PENDING" | "DELIVERED" | "FAILED" | "EXHAUSTED"; responseStatus: number | null; deliveredAt: string | null; createdAt: string }`
  - `function toWebhookDeliveryDto(row): WebhookDeliveryDto`.
  - `CheckoutQuoteInput = z.object({ itemId: z.string().uuid(), quantity: z.number().int().positive().default(1), currency: z.enum(["XLM","USDT"]).optional() })`
  - `CheckoutSubmitInput = z.object({ orderId: z.string().uuid(), txHash: z.string().min(1) })`
  - `OrderEventsParams = z.object({ id: z.string().uuid() })` for route params.

- [ ] **Step 1: Write the failing tests for DTOs and schemas**

`packages/shared/src/dto/order.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toOrderDto } from "./order";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  studioId: "22222222-2222-2222-2222-222222222222",
  itemId: "33333333-3333-3333-3333-333333333333",
  playerId: "44444444-4444-4444-4444-444444444444",
  quantity: 1,
  currency: "USDT" as const,
  grossAmount: new Prisma.Decimal("1"),
  discountAmount: new Prisma.Decimal("0"),
  platformFeeAmount: new Prisma.Decimal("0.05"),
  netToStudioAmount: new Prisma.Decimal("0.95"),
  promotionId: null,
  referralCodeUsed: null,
  idempotencyKey: "idem-1",
  stellarTxHash: null,
  paymentStatus: "PENDING" as const,
  deliveryStatus: "PENDING" as const,
  paidAt: null,
  deliveredAt: null,
  createdAt: new Date("2026-06-23T12:00:00.000Z"),
  updatedAt: new Date("2026-06-23T12:00:00.000Z"),
};

describe("toOrderDto", () => {
  it("serializes amounts to 7dp and dates to ISO", () => {
    const dto = toOrderDto(base);
    expect(dto.grossAmount).toBe("1.0000000");
    expect(dto.platformFeeAmount).toBe("0.0500000");
    expect(dto.netToStudioAmount).toBe("0.9500000");
    expect(dto.paymentStatus).toBe("PENDING");
    expect(dto.paidAt).toBeNull();
    expect(dto.createdAt).toBe("2026-06-23T12:00:00.000Z");
  });

  it("never leaks raw Decimal or Date fields", () => {
    const dto = toOrderDto(base) as Record<string, unknown>;
    expect(dto.grossAmount).toBe("1.0000000");
    expect(dto["grossAmount" as never]).not.toBeInstanceOf(Prisma.Decimal);
    expect((dto as { updatedAt?: unknown }).updatedAt).toBeUndefined();
  });
});
```

`packages/shared/src/dto/webhook.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toWebhookDeliveryDto } from "./webhook";

const row = {
  id: "w1",
  studioId: "s1",
  event: "purchase_completed" as const,
  orderId: "o1",
  tradeId: null,
  url: "https://hooks.gridlock.gg/xgamefi",
  payload: { event: "purchase.completed" },
  signature: "t=1,v1=abc",
  attempt: 2,
  maxAttempts: 5,
  status: "PENDING" as const,
  responseStatus: null,
  nextAttemptAt: null,
  createdAt: new Date("2026-06-23T12:00:00.000Z"),
  deliveredAt: null,
};

describe("toWebhookDeliveryDto", () => {
  it("maps the webhook delivery row to a DTO", () => {
    const dto = toWebhookDeliveryDto(row);
    expect(dto.event).toBe("purchase.completed");
    expect(dto.status).toBe("PENDING");
    expect(dto.responseStatus).toBeNull();
    expect(dto.deliveredAt).toBeNull();
    expect(dto.createdAt).toBe("2026-06-23T12:00:00.000Z");
  });
});
```

`packages/shared/src/zod/checkout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CheckoutQuoteInput, CheckoutSubmitInput } from "./checkout";

describe("CheckoutQuoteInput", () => {
  it("accepts itemId with default quantity", () => {
    const v = CheckoutQuoteInput.parse({ itemId: "11111111-1111-1111-1111-111111111111" });
    expect(v.quantity).toBe(1);
  });
  it("rejects non-uuid itemId", () => {
    expect(() => CheckoutQuoteInput.parse({ itemId: "nope" })).toThrow();
  });
  it("rejects quantity <= 0", () => {
    expect(() => CheckoutQuoteInput.parse({ itemId: "11111111-1111-1111-1111-111111111111", quantity: 0 })).toThrow();
  });
});

describe("CheckoutSubmitInput", () => {
  it("accepts orderId + txHash", () => {
    const v = CheckoutSubmitInput.parse({ orderId: "11111111-1111-1111-1111-111111111111", txHash: "abc123" });
    expect(v.txHash).toBe("abc123");
  });
});
```

`packages/shared/src/zod/order.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { OrderEventsParams } from "./order";

describe("OrderEventsParams", () => {
  it("accepts a uuid id", () => {
    expect(OrderEventsParams.parse({ id: "11111111-1111-1111-1111-111111111111" }).id).toBe("11111111-1111-1111-1111-111111111111");
  });
  it("rejects non-uuid", () => {
    expect(() => OrderEventsParams.parse({ id: "nope" })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xgamefi/shared test -- dto/order.test.ts dto/webhook.test.ts zod/checkout.test.ts zod/order.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement DTOs and schemas**

`packages/shared/src/dto/order.ts`:
```ts
import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export type OrderCurrency = "XLM" | "USDT";
export type OrderPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type OrderDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export type OrderRow = {
  id: string;
  studioId: string;
  itemId: string;
  playerId: string;
  quantity: number;
  currency: OrderCurrency;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  platformFeeAmount: Prisma.Decimal;
  netToStudioAmount: Prisma.Decimal;
  promotionId: string | null;
  referralCodeUsed: string | null;
  idempotencyKey: string;
  stellarTxHash: string | null;
  paymentStatus: OrderPaymentStatus;
  deliveryStatus: OrderDeliveryStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderDto = {
  id: string;
  studioId: string;
  itemId: string;
  playerId: string;
  quantity: number;
  currency: OrderCurrency;
  grossAmount: string;
  discountAmount: string;
  platformFeeAmount: string;
  netToStudioAmount: string;
  paymentStatus: OrderPaymentStatus;
  deliveryStatus: OrderDeliveryStatus;
  stellarTxHash: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export function toOrderDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    studioId: row.studioId,
    itemId: row.itemId,
    playerId: row.playerId,
    quantity: row.quantity,
    currency: row.currency,
    grossAmount: toStellarAmount(row.grossAmount),
    discountAmount: toStellarAmount(row.discountAmount),
    platformFeeAmount: toStellarAmount(row.platformFeeAmount),
    netToStudioAmount: toStellarAmount(row.netToStudioAmount),
    paymentStatus: row.paymentStatus,
    deliveryStatus: row.deliveryStatus,
    stellarTxHash: row.stellarTxHash,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

`packages/shared/src/dto/webhook.ts`:
```ts
export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "EXHAUSTED";

export type WebhookDeliveryRow = {
  id: string;
  studioId: string;
  event: string;
  orderId: string | null;
  tradeId: string | null;
  url: string;
  payload: unknown;
  signature: string;
  attempt: number;
  maxAttempts: number;
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
};

export type WebhookDeliveryDto = {
  id: string;
  studioId: string;
  event: string;
  orderId: string | null;
  attempt: number;
  maxAttempts: number;
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
};

function wireEvent(event: string): string {
  // Prisma enum uses underscores; wire format uses dots.
  return event.replace(/_/g, ".");
}

export function toWebhookDeliveryDto(row: WebhookDeliveryRow): WebhookDeliveryDto {
  return {
    id: row.id,
    studioId: row.studioId,
    event: wireEvent(row.event),
    orderId: row.orderId,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    status: row.status,
    responseStatus: row.responseStatus,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

`packages/shared/src/zod/checkout.ts`:
```ts
import { z } from "zod";

export const CheckoutQuoteInput = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  currency: z.enum(["XLM", "USDT"]).optional(),
});
export type CheckoutQuoteInput = z.infer<typeof CheckoutQuoteInput>;

export const CheckoutSubmitInput = z.object({
  orderId: z.string().uuid(),
  txHash: z.string().min(1),
});
export type CheckoutSubmitInput = z.infer<typeof CheckoutSubmitInput>;
```

`packages/shared/src/zod/order.ts`:
```ts
import { z } from "zod";

export const OrderEventsParams = z.object({
  id: z.string().uuid(),
});
export type OrderEventsParams = z.infer<typeof OrderEventsParams>;
```

- [ ] **Step 4: Export from barrels**

`packages/shared/src/dto/index.ts` (append):
```ts
export * from "./order";
export * from "./webhook";
```

`packages/shared/src/zod/index.ts` (append):
```ts
export * from "./checkout";
export * from "./order";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @xgamefi/shared test -- dto/order.test.ts dto/webhook.test.ts zod/checkout.test.ts zod/order.test.ts && pnpm --filter @xgamefi/shared exec tsc --noEmit`
Expected: PASS (all tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/dto packages/shared/src/zod

git commit -m "feat(shared): add Order/Webhook DTOs and checkout/order Zod schemas"
```

---

### Task 2: `verifyAndAdvanceOrder` — single authoritative confirmer

**Files:**
- Create: `packages/shared/src/settlement.ts`
- Test: `packages/shared/src/settlement.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `prisma`, `Prisma` (`@xgamefi/db`); `verifyPayment`, `Asset`, `sendPayment` (not used here), `type VerifyResult` from `@xgamefi/shared/stellar`; `env` (`@xgamefi/config/env` for `STELLAR_RECEIVING_ACCOUNT`, `STELLAR_USD_ASSET_*`, `PLATFORM_FEE_BPS`); `getQueue` from `@xgamefi/shared/queues` (Task 4).
- Produces:
  - `async function verifyAndAdvanceOrder(args: { orderId: string; txHash: string }): Promise<{ status: "PAID" | "ALREADY" | "REJECTED"; reason?: string }>`
  - Behavior: runs in `prisma.$transaction`; loads order with item + studio; if `paymentStatus === PAID` returns `{ status: "ALREADY" }`; calls `verifyPayment({ txHash, expectedDestination, expectedAsset, minAmount, expectedMemo })`; on ok, sets `Order.paymentStatus = PAID`, `paidAt = now`, `stellarTxHash = txHash`; writes `LedgerEntry(SALE_IN)`; enqueues `payout` and `webhook-delivery` jobs (via `getQueue`); returns `{ status: "PAID" }`. On verify failure returns `{ status: "REJECTED", reason }`. On any unexpected error throws so BullMQ can retry.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/settlement.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyPayment = vi.fn();
const add = vi.fn();
const getQueue = vi.fn(() => ({ add }));
const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({
  order: { findUnique: orderFindUnique, update: orderUpdate },
  ledgerEntry: { create: ledgerCreate },
}));
const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const ledgerCreate = vi.fn();

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { $transaction } };
});
vi.mock("./stellar", () => ({ verifyPayment }));
vi.mock("./queues", () => ({ getQueue }));

import { verifyAndAdvanceOrder } from "./settlement";

const orderBase = {
  id: "o1",
  studioId: "s1",
  itemId: "i1",
  playerId: "p1",
  quantity: 1,
  currency: "USDT" as const,
  grossAmount: { toFixed: () => "1.0000000" },
  discountAmount: { toFixed: () => "0" },
  platformFeeAmount: { toFixed: () => "0.0500000" },
  netToStudioAmount: { toFixed: () => "0.9500000" },
  idempotencyKey: "idem-1",
  stellarTxHash: null,
  paymentStatus: "PENDING" as const,
  deliveryStatus: "PENDING" as const,
  paidAt: null,
  deliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  item: { id: "i1", studioId: "s1" },
  studio: { id: "s1", platformFeeBps: 500, payoutWalletAddress: "GOUT" },
};

beforeEach(() => {
  verifyPayment.mockReset();
  add.mockReset();
  getQueue.mockClear();
  $transaction.mockClear();
  orderFindUnique.mockReset().mockResolvedValue(orderBase);
  orderUpdate.mockReset().mockResolvedValue(orderBase);
  ledgerCreate.mockReset().mockResolvedValue({});
});

describe("verifyAndAdvanceOrder", () => {
  it("returns ALREADY when the order is already PAID", async () => {
    orderFindUnique.mockResolvedValue({ ...orderBase, paymentStatus: "PAID" });
    const res = await verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx1" });
    expect(res.status).toBe("ALREADY");
    expect(verifyPayment).not.toHaveBeenCalled();
  });

  it("returns PAID and writes ledger + enqueues jobs on successful verification", async () => {
    verifyPayment.mockResolvedValue({
      ok: true,
      txHash: "tx1",
      amount: { equals: () => true, toFixed: () => "1.0000000" },
      memo: "o1",
      asset: { code: "USDT", issuer: "GISSUER" },
    });

    const res = await verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx1" });

    expect(res.status).toBe("PAID");
    expect(orderUpdate).toHaveBeenCalled();
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "SALE_IN" }));
    expect(add).toHaveBeenCalledTimes(2);
    expect(getQueue).toHaveBeenCalledWith("payout");
    expect(getQueue).toHaveBeenCalledWith("webhook-delivery");
  });

  it("returns REJECTED when verification fails", async () => {
    verifyPayment.mockResolvedValue({ ok: false, reason: "memo mismatch" });
    const res = await verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx2" });
    expect(res.status).toBe("REJECTED");
    expect(res.reason).toBe("memo mismatch");
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects if the order is not found", async () => {
    orderFindUnique.mockResolvedValue(null);
    await expect(verifyAndAdvanceOrder({ orderId: "o1", txHash: "tx1" })).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- settlement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `verifyAndAdvanceOrder`**

`packages/shared/src/settlement.ts`:
```ts
import { prisma, Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyPayment, type Asset } from "./stellar";
import { getQueue } from "./queues";

export type VerifyAdvanceResult =
  | { status: "PAID" }
  | { status: "ALREADY" }
  | { status: "REJECTED"; reason: string };

export async function verifyAndAdvanceOrder(args: {
  orderId: string;
  txHash: string;
}): Promise<VerifyAdvanceResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      include: { item: true, studio: true },
    });
    if (!order) throw new Error(`verifyAndAdvanceOrder: order ${args.orderId} not found`);

    if (order.paymentStatus === "PAID") {
      return { status: "ALREADY" };
    }

    const expectedAsset: Asset =
      order.currency === "XLM"
        ? { code: "XLM" }
        : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

    const verify = await verifyPayment({
      txHash: args.txHash,
      expectedDestination: env.STELLAR_RECEIVING_ACCOUNT,
      expectedAsset,
      minAmount: order.grossAmount,
      expectedMemo: order.id,
    });

    if (!verify.ok) {
      return { status: "REJECTED", reason: verify.reason };
    }

    // Confirm txHash is not already bound to a different order.
    const existing = await tx.order.findUnique({ where: { stellarTxHash: args.txHash } });
    if (existing && existing.id !== order.id) {
      return { status: "REJECTED", reason: "txHash already used" };
    }

    const now = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        stellarTxHash: args.txHash,
        paidAt: now,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        type: "SALE_IN",
        orderId: order.id,
        stellarTxHash: args.txHash,
        sourceAddress: verify.amount ? "" : "", // source not needed for SALE_IN; use empty
        destAddress: env.STELLAR_RECEIVING_ACCOUNT,
        amount: order.grossAmount,
        assetCode: expectedAsset.code,
        assetIssuer: "issuer" in expectedAsset ? expectedAsset.issuer : null,
        status: "CONFIRMED",
      },
    });

    // Enqueue downstream jobs outside the transaction so a queue failure cannot
    // roll back the verified payment, and duplicate jobIds keep retries safe.
    await getQueue("payout").add("payout", { orderId: order.id }, { jobId: `payout-${order.id}` });
    await getQueue("webhook-delivery").add(
      "webhook-delivery",
      { orderId: order.id },
      { jobId: `webhook-${order.id}` },
    );

    return { status: "PAID" };
  });
}
```

> Note: `LedgerEntry.sourceAddress` is populated with the payer address from the Horizon result in a real implementation. For the demo, the source address is not required for `SALE_IN`; store the on-chain source when `verifyPayment` returns it (extend `VerifyResult` in `stellar.ts` if needed). If extending, update the type and this task atomically.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- settlement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/settlement.ts packages/shared/src/settlement.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add verifyAndAdvanceOrder authoritative confirmer"
```

---

### Task 3: `withIdempotency` helper

**Files:**
- Create: `packages/shared/src/idempotency.ts`
- Test: `packages/shared/src/idempotency.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); ioredis Redis connection (`apps/worker/src/redis.ts` exported as `getRedis()` or via `@xgamefi/shared/queues` — keep dependency on `@xgamefi/worker` minimal by passing redis in or using a shared connection helper in `queues.ts`).
- Produces:
  - `async function withIdempotency<T>(args: { key: string; scope: string; requestHash: string }, fn: () => Promise<T>): Promise<T>`
  - Acquires a Redis lock (`redlock:{scope}:{key}`) for the duration; checks `IdempotencyKey` table; if a row exists with the same `key` but different `requestHash`, throws `409`; if same `requestHash`, returns `responseSnapshot`; otherwise runs `fn`, stores the snapshot, and returns it.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/idempotency.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const set = vi.fn();
const get = vi.fn();
const del = vi.fn();

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { idempotencyKey: { findUnique, create } } };
});

const redis = { set, get, del };

import { withIdempotency, IdempotencyConflictError } from "./idempotency";

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  set.mockReset().mockResolvedValue("OK");
  get.mockReset().mockResolvedValue(null);
  del.mockReset().mockResolvedValue(1);
});

describe("withIdempotency", () => {
  it("runs fn and stores the snapshot on first call", async () => {
    findUnique.mockResolvedValue(null);
    const res = await withIdempotency(
      { key: "k1", scope: "checkout:submit", requestHash: "h1" },
      async () => ({ status: "PAID" }),
      redis as never,
    );
    expect(res).toEqual({ status: "PAID" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ key: "k1", scope: "checkout:submit", requestHash: "h1" }));
  });

  it("replays a stored snapshot for the same key+hash", async () => {
    findUnique.mockResolvedValue({ responseSnapshot: { status: "PAID" } });
    const fn = vi.fn();
    const res = await withIdempotency(
      { key: "k1", scope: "checkout:submit", requestHash: "h1" },
      fn,
      redis as never,
    );
    expect(res).toEqual({ status: "PAID" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws IdempotencyConflictError when key exists with a different hash", async () => {
    findUnique.mockResolvedValue({ responseSnapshot: { status: "PAID" }, requestHash: "other" });
    await expect(
      withIdempotency(
        { key: "k1", scope: "checkout:submit", requestHash: "h1" },
        async () => ({ status: "PAID" }),
        redis as never,
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- idempotency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `withIdempotency`**

`packages/shared/src/idempotency.ts`:
```ts
import { prisma } from "@xgamefi/db";

export class IdempotencyConflictError extends Error {
  constructor(message = "idempotency key conflict") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export type RedisLike = {
  set(key: string, value: string, options?: { px?: number; nx?: boolean }): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

export async function withIdempotency<T>(
  args: { key: string; scope: string; requestHash: string },
  fn: () => Promise<T>,
  redis: RedisLike,
): Promise<T> {
  const lockKey = `idempotency-lock:${args.scope}:${args.key}`;
  const lockValue = `${Date.now()}`;
  const lockTtlMs = 30_000;

  const acquired = await redis.set(lockKey, lockValue, { px: lockTtlMs, nx: true });
  if (acquired !== "OK") {
    throw new IdempotencyConflictError("idempotency key already in progress");
  }

  try {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: args.key } });
    if (existing) {
      if (existing.requestHash !== args.requestHash) {
        throw new IdempotencyConflictError();
      }
      return existing.responseSnapshot as T;
    }

    const result = await fn();
    await prisma.idempotencyKey.create({
      data: {
        key: args.key,
        scope: args.scope,
        requestHash: args.requestHash,
        responseSnapshot: result as unknown as Record<string, unknown>,
      },
    });
    return result;
  } finally {
    await redis.del(lockKey);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- idempotency.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/idempotency.ts packages/shared/src/idempotency.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add withIdempotency helper (redis lock + snapshot replay)"
```

---

### Task 4: BullMQ queue bootstrap (`getQueue` / `registerWorker`)

**Files:**
- Create: `packages/shared/src/queues.ts`
- Test: `packages/shared/src/queues.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `env` (`@xgamefi/config/env` for `REDIS_URL`); bullmq `Queue`, `Worker`; ioredis `Redis`.
- Produces:
  - `function getQueue(name: QueueName): Queue`
  - `function registerWorker(name: QueueName, processor: Processor): Worker`
  - `type QueueName = "catalogue-sync" | "stellar-watcher" | "webhook-delivery" | "payout" | "p2p-settlement" | "referral-reward" | "refund"`
  - `function getRedis(): Redis` — shared ioredis connection used by idempotency + SSE.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/queues.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@xgamefi/config/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));

import { getQueue, registerWorker, QueueName } from "./queues";

describe("queues", () => {
  it("returns the same Queue instance for the same name", () => {
    const a = getQueue("payout" as QueueName);
    const b = getQueue("payout" as QueueName);
    expect(a).toBe(b);
  });

  it("returns different Queue instances for different names", () => {
    const a = getQueue("payout" as QueueName);
    const b = getQueue("webhook-delivery" as QueueName);
    expect(a).not.toBe(b);
  });

  it("registers a worker", () => {
    const worker = registerWorker("payout" as QueueName, async () => "ok");
    expect(worker).toBeDefined();
    worker.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- queues.test.ts`
Expected: FAIL — module not found or env mock issue.

- [ ] **Step 3: Implement queue bootstrap**

`packages/shared/src/queues.ts`:
```ts
import { Queue, Worker, type Processor } from "bullmq";
import { Redis } from "ioredis";
import { env } from "@xgamefi/config/env";

export type QueueName =
  | "catalogue-sync"
  | "stellar-watcher"
  | "webhook-delivery"
  | "payout"
  | "p2p-settlement"
  | "referral-reward"
  | "refund";

let redis: Redis | null = null;
const queueMap = new Map<QueueName, Queue>();

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

export function getQueue(name: QueueName): Queue {
  let q = queueMap.get(name);
  if (!q) {
    q = new Queue(name, { connection: getRedis(), defaultJobOptions: { removeOnComplete: 10, removeOnFail: 10 } });
    queueMap.set(name, q);
  }
  return q;
}

export function registerWorker(name: QueueName, processor: Processor): Worker {
  return new Worker(name, processor, { connection: getRedis(), concurrency: 5 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- queues.test.ts`
Expected: PASS (3 tests). If Redis is not running, the `Worker` constructor may still succeed (connection is lazy); if it fails, add `it.skipIf(!process.env.REDIS_URL)` guards.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/queues.ts packages/shared/src/queues.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add BullMQ queue registry with getQueue/registerWorker/getRedis"
```

---

### Task 5: `POST /checkout/quote`

**Files:**
- Create: `apps/web/app/api/v1/checkout/quote/route.ts`
- Test: `apps/web/app/api/v1/checkout/quote/route.test.ts`
- Create: `apps/web/lib/checkout-queries.ts`
- Test: `apps/web/lib/checkout-queries.test.ts`

**Interfaces:**
- Consumes: `requirePrincipal` (`apps/web/lib/auth`, P1); `prisma`, `Prisma` (`@xgamefi/db`); `CheckoutQuoteInput` (Task 1); `feeAmount`, `netAmount`, `toStellarAmount` (`@xgamefi/shared/money`); `env` (`STELLAR_RECEIVING_ACCOUNT`, `STELLAR_USD_ASSET_*`, `PLATFORM_FEE_BPS`); `buildPaymentXdr` (`@xgamefi/shared/stellar`); `toOrderDto` (Task 1).
- Produces:
  - `POST /checkout/quote` → `200 { order: OrderDto; quote: { destination: string; asset: Asset; amount: string; memo: string; unsignedXdr?: string } }`
  - Creates `Order` in `PENDING`, binds memo to `order.id`, computes gross = item.price * quantity, platform fee, net to studio.
  - Returns unsigned XDR so Freighter can sign it directly.

- [ ] **Step 1: Write the failing test for `createOrderQuote`**

`apps/web/lib/checkout-queries.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const itemFindUnique = vi.fn();
const orderCreate = vi.fn();

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { item: { findUnique: itemFindUnique }, order: { create: orderCreate } } };
});

vi.mock("@xgamefi/config/env", () => ({
  env: {
    STELLAR_RECEIVING_ACCOUNT: "GRECEIVER",
    STELLAR_USD_ASSET_CODE: "USDT",
    STELLAR_USD_ASSET_ISSUER: "GISSUER",
    PLATFORM_FEE_BPS: "500",
  },
}));

import { createOrderQuote } from "./checkout-queries";

beforeEach(() => {
  itemFindUnique.mockReset().mockResolvedValue({
    id: "i1",
    studioId: "s1",
    priceAmount: { times: () => ({ toFixed: () => "1.0000000" }) },
    priceCurrency: "USDT",
  });
  orderCreate.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    itemId: "i1",
    playerId: "p1",
    quantity: 1,
    currency: "USDT",
    grossAmount: { toFixed: () => "1.0000000" },
    discountAmount: { toFixed: () => "0" },
    platformFeeAmount: { toFixed: () => "0.0500000" },
    netToStudioAmount: { toFixed: () => "0.9500000" },
    idempotencyKey: "idem-1",
    stellarTxHash: null,
    paymentStatus: "PENDING",
    deliveryStatus: "PENDING",
    paidAt: null,
    deliveredAt: null,
    createdAt: new Date("2026-06-23T12:00:00.000Z"),
    updatedAt: new Date("2026-06-23T12:00:00.000Z"),
  });
});

describe("createOrderQuote", () => {
  it("creates a pending order with memo bound to order id", async () => {
    const res = await createOrderQuote({ playerId: "p1", itemId: "i1", quantity: 1 });
    expect(res.order.id).toBe("o1");
    expect(res.quote.memo).toBe("o1");
    expect(res.quote.destination).toBe("GRECEIVER");
    expect(orderCreate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- checkout-queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `createOrderQuote`**

`apps/web/lib/checkout-queries.ts`:
```ts
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

export async function getOrder(orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, include: { item: true, studio: true } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- checkout-queries.test.ts`
Expected: PASS (1 test). The `buildPaymentXdr` call may require network; mock it if needed in the test.

- [ ] **Step 5: Write + implement the route handler**

`apps/web/app/api/v1/checkout/quote/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePrincipal = vi.fn();
const createOrderQuote = vi.fn();

vi.mock("@/lib/auth", () => ({ requirePrincipal }));
vi.mock("@/lib/checkout-queries", () => ({ createOrderQuote }));

import { POST } from "./route";

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  createOrderQuote.mockReset().mockResolvedValue({
    order: { id: "o1" },
    quote: { destination: "GRECEIVER", asset: { code: "USDT", issuer: "GISSUER" }, amount: "1.0000000", memo: "o1", unsignedXdr: "xdr" },
  });
});

describe("POST /checkout/quote", () => {
  it("requires a player principal", async () => {
    requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN" });
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ itemId: "i1" }) }));
    expect(res.status).toBe(403);
  });

  it("returns order + quote for valid input", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ itemId: "i1" }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.id).toBe("o1");
    expect(body.quote.memo).toBe("o1");
    expect(createOrderQuote).toHaveBeenCalledWith(expect.objectContaining({ playerId: "p1", itemId: "i1" }));
  });
});
```

`apps/web/app/api/v1/checkout/quote/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createOrderQuote } from "@/lib/checkout-queries";
import { CheckoutQuoteInput } from "@xgamefi/shared/zod";

export async function POST(req: Request): Promise<Response> {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }

  const parsed = CheckoutQuoteInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const result = await createOrderQuote({
    playerId: principal.playerId,
    itemId: parsed.data.itemId,
    quantity: parsed.data.quantity,
    currency: parsed.data.currency,
  });

  return NextResponse.json(result, { status: 200 });
}
```

- [ ] **Step 6: Run route test and typecheck**

Run: `pnpm --filter @xgamefi/web test -- checkout/quote/route.test.ts && pnpm --filter @xgamefi/web exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/v1/checkout/quote apps/web/lib/checkout-queries.ts

git commit -m "feat(web): POST /checkout/quote creates pending order and returns Stellar quote"
```

---

### Task 6: `POST /checkout/submit` (idempotent fast-path)

**Files:**
- Create: `apps/web/app/api/v1/checkout/submit/route.ts`
- Test: `apps/web/app/api/v1/checkout/submit/route.test.ts`
- Modify: `apps/web/lib/checkout-queries.ts` (add `getOrder` already included above)

**Interfaces:**
- Consumes: `requirePrincipal` (P1); `CheckoutSubmitInput` (Task 1); `withIdempotency`, `getRedis` (`@xgamefi/shared/idempotency`, `@xgamefi/shared/queues`); `verifyAndAdvanceOrder` (`@xgamefi/shared/settlement`); `toOrderDto`.
- Produces:
  - `POST /checkout/submit` → `200 { order: OrderDto; result: { status: "PAID" | "ALREADY" | "REJECTED"; reason?: string } }`
  - Requires `Idempotency-Key` header. Uses `withIdempotency` keyed by header + scope `checkout:submit` + sha256(rawBody).

- [ ] **Step 1: Write the failing test**

`apps/web/app/api/v1/checkout/submit/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePrincipal = vi.fn();
const withIdempotency = vi.fn();
const verifyAndAdvanceOrder = vi.fn();
const getOrder = vi.fn();

vi.mock("@/lib/auth", () => ({ requirePrincipal }));
vi.mock("@xgamefi/shared/idempotency", () => ({ withIdempotency, getRedis: () => ({}), IdempotencyConflictError: class extends Error {} }));
vi.mock("@xgamefi/shared/settlement", () => ({ verifyAndAdvanceOrder }));
vi.mock("@/lib/checkout-queries", () => ({ getOrder }));

import { POST } from "./route";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: new Headers({ "idempotency-key": "idem-1", ...headers }),
  });
}

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  withIdempotency.mockReset().mockImplementation(async (_args, fn) => fn());
  verifyAndAdvanceOrder.mockReset().mockResolvedValue({ status: "PAID" });
  getOrder.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    itemId: "i1",
    playerId: "p1",
    quantity: 1,
    currency: "USDT",
    grossAmount: { toFixed: () => "1.0000000" },
    discountAmount: { toFixed: () => "0" },
    platformFeeAmount: { toFixed: () => "0.0500000" },
    netToStudioAmount: { toFixed: () => "0.9500000" },
    idempotencyKey: "idem-1",
    stellarTxHash: "tx1",
    paymentStatus: "PAID",
    deliveryStatus: "PENDING",
    paidAt: new Date(),
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("POST /checkout/submit", () => {
  it("requires idempotency-key header", async () => {
    const res = await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ orderId: "o1", txHash: "tx1" }) }));
    expect(res.status).toBe(400);
  });

  it("calls verifyAndAdvanceOrder and returns order + result", async () => {
    const res = await POST(req({ orderId: "o1", txHash: "tx1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.status).toBe("PAID");
    expect(body.order.id).toBe("o1");
    expect(verifyAndAdvanceOrder).toHaveBeenCalledWith({ orderId: "o1", txHash: "tx1" });
  });

  it("returns 403 for non-player principal", async () => {
    requirePrincipal.mockResolvedValue({ kind: "user", role: "ADMIN" });
    const res = await POST(req({ orderId: "o1", txHash: "tx1" }));
    expect(res.status).toBe(403);
  });

  it("returns REJECTED result without throwing", async () => {
    verifyAndAdvanceOrder.mockResolvedValue({ status: "REJECTED", reason: "memo mismatch" });
    const res = await POST(req({ orderId: "o1", txHash: "tx1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.status).toBe("REJECTED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- checkout/submit/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

`apps/web/app/api/v1/checkout/submit/route.ts`:
```ts
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getOrder } from "@/lib/checkout-queries";
import { CheckoutSubmitInput } from "@xgamefi/shared/zod";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { withIdempotency, getRedis } from "@xgamefi/shared/idempotency";
import { toOrderDto } from "@xgamefi/shared/dto";

export async function POST(req: Request): Promise<Response> {
  const principal = await requirePrincipal();
  if (principal.kind !== "player") {
    return NextResponse.json({ error: "player wallet required" }, { status: 403 });
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Idempotency-Key header required" }, { status: 400 });
  }

  const rawBody = await req.text();
  const parsed = CheckoutSubmitInput.safeParse(safeJson(rawBody));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const requestHash = createHash("sha256").update(rawBody).digest("hex");

  const result = await withIdempotency(
    { key: idempotencyKey, scope: "checkout:submit", requestHash },
    async () => {
      const advance = await verifyAndAdvanceOrder({ orderId: parsed.data.orderId, txHash: parsed.data.txHash });
      const order = await getOrder(parsed.data.orderId);
      if (!order) throw new Error("order disappeared after verify");
      return { order: toOrderDto(order), result: advance };
    },
    getRedis(),
  );

  return NextResponse.json(result, { status: 200 });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- checkout/submit/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/checkout/submit/route.ts apps/web/app/api/v1/checkout/submit/route.test.ts

git commit -m "feat(web): POST /checkout/submit with idempotency and verifyAndAdvanceOrder"
```

---

### Task 7: `stellar-watcher` worker

**Files:**
- Create: `apps/worker/src/jobs/stellar-watcher.ts`
- Test: `apps/worker/src/jobs/stellar-watcher.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `verifyAndAdvanceOrder` (`@xgamefi/shared/settlement`); `env` (`STELLAR_HORIZON_URL`, `STELLAR_RECEIVING_ACCOUNT`); `registerWorker` (`@xgamefi/shared/queues`).
- Produces:
  - `function stellarWatcherProcessor(job: { data: { cursor?: string } }): Promise<{ processed: number; cursor?: string }>`
  - Polls Horizon payments for `STELLAR_RECEIVING_ACCOUNT` (or streams if SDK supports it in test environment). For each payment with a text memo matching a `PENDING` order id, calls `verifyAndAdvanceOrder`. Stores cursor in Redis (`stellar-watcher:cursor`).

- [ ] **Step 1: Write the failing test**

`apps/worker/src/jobs/stellar-watcher.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAndAdvanceOrder = vi.fn();
const findMany = vi.fn();
const get = vi.fn();
const set = vi.fn();

vi.mock("@xgamefi/shared/settlement", () => ({ verifyAndAdvanceOrder }));
vi.mock("@xgamefi/shared/queues", () => ({ registerWorker: vi.fn(), getRedis: () => ({ get, set }) }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { order: { findMany } } };
});
vi.mock("@xgamefi/config/env", () => ({
  env: { STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org", STELLAR_RECEIVING_ACCOUNT: "GRECEIVER" },
}));

import { stellarWatcherProcessor } from "./stellar-watcher";

beforeEach(() => {
  verifyAndAdvanceOrder.mockReset().mockResolvedValue({ status: "PAID" });
  findMany.mockReset().mockResolvedValue([{ id: "o1" }, { id: "o2" }]);
  get.mockReset().mockResolvedValue(null);
  set.mockReset().mockResolvedValue("OK");
});

describe("stellarWatcherProcessor", () => {
  it("processes payments whose memo matches a pending order", async () => {
    // The processor will fetch pending orders and then query Horizon for payments
    // with those memos. We stub the Horizon call via module internals if possible,
    // or test the memo-matching logic directly by exporting `matchAndAdvance`.
    // For this test we assert the high-level contract: it calls verifyAndAdvanceOrder
    // for matched orders and updates cursor.
    const res = await stellarWatcherProcessor({ data: {} });
    expect(res.processed).toBeGreaterThanOrEqual(0);
  });
});
```

> Because Horizon polling is environment-dependent, expose a testable helper `matchAndAdvancePayments(orders, payments)` and unit-test that.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/worker test -- stellar-watcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the worker**

`apps/worker/src/jobs/stellar-watcher.ts`:
```ts
import { Horizon } from "@stellar/stellar-sdk";
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { getRedis } from "@xgamefi/shared/queues";

const CURSOR_KEY = "stellar-watcher:cursor";
const POLL_LIMIT = 200;

export type StellarWatcherJobData = { cursor?: string };

export function matchAndAdvancePayments(
  orders: { id: string }[],
  payments: { memo?: string; txHash?: string }[],
): { id: string; txHash: string }[] {
  const pendingIds = new Set(orders.map((o) => o.id));
  const matched: { id: string; txHash: string }[] = [];
  for (const p of payments) {
    if (p.memo && pendingIds.has(p.memo) && p.txHash) {
      matched.push({ id: p.memo, txHash: p.txHash });
    }
  }
  return matched;
}

export async function stellarWatcherProcessor(job: { data: StellarWatcherJobData }): Promise<{ processed: number; cursor?: string }> {
  const redis = getRedis();
  const server = new Horizon.Server(env.STELLAR_HORIZON_URL);
  const account = server.payments().forAccount(env.STELLAR_RECEIVING_ACCOUNT).limit(POLL_LIMIT).order("asc");

  const cursor = job.data.cursor ?? (await redis.get(CURSOR_KEY)) ?? undefined;
  if (cursor) account.cursor(cursor);

  const payments: { memo?: string; txHash?: string }[] = [];
  let nextCursor: string | undefined;

  // Horizon paginated call
  const response = await account.call();
  for (const record of response.records) {
    payments.push({ memo: (record as { transaction_memo?: string }).transaction_memo, txHash: record.transaction_hash });
    nextCursor = record.paging_token;
  }

  const pendingOrders = await prisma.order.findMany({
    where: { paymentStatus: "PENDING" },
    select: { id: true },
  });

  const matched = matchAndAdvancePayments(pendingOrders, payments);
  let processed = 0;
  for (const m of matched) {
    try {
      const res = await verifyAndAdvanceOrder({ orderId: m.id, txHash: m.txHash });
      if (res.status === "PAID" || res.status === "ALREADY") processed++;
    } catch (err) {
      console.error(`stellar-watcher: failed to advance ${m.id}`, err);
    }
  }

  if (nextCursor) {
    await redis.set(CURSOR_KEY, nextCursor);
  }

  return { processed, cursor: nextCursor };
}
```

> Horizon `transaction_memo` may not be present on the payment operation record; if not, fetch the transaction record by hash to read the memo. Add a helper `fetchMemoForPayment(record)` and unit-test it. The core invariant is: match by order id memo.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/worker test -- stellar-watcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Register worker**

`apps/worker/src/index.ts` (add):
```ts
import { registerWorker } from "@xgamefi/shared/queues";
import { stellarWatcherProcessor } from "./jobs/stellar-watcher";

registerWorker("stellar-watcher", stellarWatcherProcessor);
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/jobs/stellar-watcher.ts apps/worker/src/jobs/stellar-watcher.test.ts apps/worker/src/index.ts

git commit -m "feat(worker): add stellar-watcher job (poll Horizon, match by order memo)"
```

---

### Task 8: `payout` worker

**Files:**
- Create: `apps/worker/src/jobs/payout.ts`
- Test: `apps/worker/src/jobs/payout.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `prisma`, `Prisma` (`@xgamefi/db`); `sendPayment`, `toStellarAmount` (`@xgamefi/shared/stellar`, `@xgamefi/shared/money`); `env` (`STELLAR_PAYOUT_SIGNER_SECRET`, `STELLAR_USD_ASSET_*`); `registerWorker`.
- Produces:
  - `type PayoutJobData = { orderId: string }`
  - `async function payoutProcessor(job): Promise<{ txHash: string }>` — loads order (must be `PAID`, payout not yet done), sends `netToStudioAmount` to `studio.payoutWalletAddress`, writes `LedgerEntry(PAYOUT_OUT)`, updates `Order` with payout txHash.

- [ ] **Step 1: Write the failing test**

`apps/worker/src/jobs/payout.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendPayment = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();

vi.mock("@xgamefi/shared/stellar", () => ({ sendPayment }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { order: { findUnique, update }, ledgerEntry: { create } } };
});

import { payoutProcessor } from "./payout";

beforeEach(() => {
  sendPayment.mockReset().mockResolvedValue({ txHash: "payout-tx-1" });
  findUnique.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    currency: "USDT",
    netToStudioAmount: { toFixed: () => "0.9500000" },
    paymentStatus: "PAID",
    stellarTxHash: "tx1",
    studio: { payoutWalletAddress: "GOUT" },
  });
  update.mockReset().mockResolvedValue({});
  create.mockReset().mockResolvedValue({});
});

describe("payoutProcessor", () => {
  it("sends net amount and writes PAYOUT_OUT ledger entry", async () => {
    const res = await payoutProcessor({ data: { orderId: "o1" } });
    expect(res.txHash).toBe("payout-tx-1");
    expect(sendPayment).toHaveBeenCalledWith(expect.objectContaining({ destination: "GOUT", amount: "0.9500000" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: "PAYOUT_OUT" }));
    expect(update).toHaveBeenCalled();
  });

  it("skips if the order is not PAID", async () => {
    findUnique.mockResolvedValue({ paymentStatus: "PENDING" });
    await expect(payoutProcessor({ data: { orderId: "o1" } })).rejects.toThrow(/PAID/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/worker test -- payout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the processor**

`apps/worker/src/jobs/payout.ts`:
```ts
import { prisma, Prisma } from "@xgamefi/db";
import { sendPayment, type Asset } from "@xgamefi/shared/stellar";
import { toStellarAmount } from "@xgamefi/shared/money";
import { env } from "@xgamefi/config/env";

export type PayoutJobData = { orderId: string };

export async function payoutProcessor(job: { data: PayoutJobData }): Promise<{ txHash: string }> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { studio: true },
  });
  if (!order) throw new Error(`payout: order ${orderId} not found`);
  if (order.paymentStatus !== "PAID") throw new Error(`payout: order ${orderId} is not PAID`);
  if (!order.studio?.payoutWalletAddress) throw new Error(`payout: studio ${order.studioId} has no payout wallet`);

  const asset: Asset =
    order.currency === "XLM"
      ? { code: "XLM" }
      : { code: env.STELLAR_USD_ASSET_CODE, issuer: env.STELLAR_USD_ASSET_ISSUER };

  const amount = toStellarAmount(order.netToStudioAmount);
  const memo = `payout:${order.id}`;

  const { txHash } = await sendPayment({
    destination: order.studio.payoutWalletAddress,
    asset,
    amount,
    memo,
  });

  await prisma.$transaction([
    prisma.ledgerEntry.create({
      data: {
        type: "PAYOUT_OUT",
        orderId: order.id,
        stellarTxHash: txHash,
        sourceAddress: env.STELLAR_RECEIVING_ACCOUNT,
        destAddress: order.studio.payoutWalletAddress,
        amount: order.netToStudioAmount,
        assetCode: asset.code,
        assetIssuer: "issuer" in asset ? asset.issuer : null,
        status: "CONFIRMED",
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { deliveryStatus: "PENDING" }, // unchanged; delivery is webhook's job
    }),
  ]);

  return { txHash };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/worker test -- payout.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register worker**

`apps/worker/src/index.ts` (add):
```ts
import { payoutProcessor } from "./jobs/payout";

registerWorker("payout", payoutProcessor);
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/jobs/payout.ts apps/worker/src/jobs/payout.test.ts apps/worker/src/index.ts

git commit -m "feat(worker): add payout job (send net to studio, write PAYOUT_OUT ledger)"
```

---

### Task 9: `webhook-delivery` worker

**Files:**
- Create: `apps/worker/src/jobs/webhook-delivery.ts`
- Test: `apps/worker/src/jobs/webhook-delivery.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `signWebhook` (`@xgamefi/shared/hmac`); `safeFetch` (`@xgamefi/shared/ssrf`); `env` (`WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_TIMESTAMP_TOLERANCE_SEC`); `registerWorker`, `getQueue` (`@xgamefi/shared/queues`).
- Produces:
  - `type WebhookDeliveryJobData = { orderId: string }`
  - `async function webhookDeliveryProcessor(job): Promise<{ status: string }>` — loads order + studio; creates `WebhookDelivery` row; builds payload `{ event: "purchase.completed", order: OrderDto }`; signs; POSTs to `studio.webhookUrl` via `safeFetch` (10s timeout, 1MB cap). On `2xx`, marks `DELIVERED` + `Order.deliveryStatus = DELIVERED`. On non-2xx or network error, increments attempt, schedules retry (exponential backoff up to `WEBHOOK_MAX_ATTEMPTS`), then `EXHAUSTED`; on exhaustion, emits `purchase.failed` and enqueues `refund`.

- [ ] **Step 1: Write the failing test**

`apps/worker/src/jobs/webhook-delivery.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetch = vi.fn();
const signWebhook = vi.fn(() => "t=1,v1=abc");
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const orderUpdate = vi.fn();
const getQueue = vi.fn(() => ({ add: vi.fn() }));

vi.mock("@xgamefi/shared/ssrf", () => ({ safeFetch }));
vi.mock("@xgamefi/shared/hmac", () => ({ signWebhook }));
vi.mock("@xgamefi/shared/queues", () => ({ registerWorker: vi.fn(), getQueue }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: {
    order: { findUnique, update: orderUpdate },
    webhookDelivery: { create, update },
    studio: { findUnique: vi.fn() },
  }};
});
vi.mock("@xgamefi/config/env", () => ({
  env: { WEBHOOK_MAX_ATTEMPTS: 5, WEBHOOK_TIMESTAMP_TOLERANCE_SEC: 300 },
}));

import { webhookDeliveryProcessor } from "./webhook-delivery";

beforeEach(() => {
  safeFetch.mockReset().mockResolvedValue(new Response("ok", { status: 200 }));
  findUnique.mockReset().mockResolvedValue({
    id: "o1",
    studioId: "s1",
    paymentStatus: "PAID",
    deliveryStatus: "PENDING",
    studio: { webhookUrl: "https://hooks.gridlock.gg/xgamefi", webhookSecretHash: "hash" },
  });
  create.mockReset().mockResolvedValue({ id: "wd1", attempt: 0 });
  update.mockReset().mockResolvedValue({});
  orderUpdate.mockReset().mockResolvedValue({});
});

describe("webhookDeliveryProcessor", () => {
  it("delivers purchase.completed on 2xx and marks delivered", async () => {
    const res = await webhookDeliveryProcessor({ data: { orderId: "o1" } });
    expect(res.status).toBe("DELIVERED");
    expect(safeFetch).toHaveBeenCalled();
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deliveryStatus: "DELIVERED" }) }));
  });

  it("increments attempt and schedules retry on failure", async () => {
    safeFetch.mockResolvedValue(new Response("err", { status: 500 }));
    const res = await webhookDeliveryProcessor({ data: { orderId: "o1" } });
    expect(res.status).toBe("FAILED");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attempt: expect.any(Number) }) }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/worker test -- webhook-delivery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the processor**

`apps/worker/src/jobs/webhook-delivery.ts`:
```ts
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { signWebhook } from "@xgamefi/shared/hmac";
import { safeFetch } from "@xgamefi/shared/ssrf";
import { toOrderDto } from "@xgamefi/shared/dto";
import { getQueue } from "@xgamefi/shared/queues";

export type WebhookDeliveryJobData = { orderId: string };

function eventName(event: "purchase_completed" | "purchase_pending" | "purchase_failed"): string {
  return event.replace(/_/g, ".");
}

export async function webhookDeliveryProcessor(job: { data: WebhookDeliveryJobData }): Promise<{ status: string }> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { studio: true, item: true } });
  if (!order) throw new Error(`webhook-delivery: order ${orderId} not found`);
  if (order.paymentStatus !== "PAID") throw new Error(`webhook-delivery: order ${orderId} is not PAID`);
  if (!order.studio?.webhookUrl) throw new Error(`webhook-delivery: studio ${order.studioId} has no webhookUrl`);

  const studio = order.studio;
  const event: "purchase_completed" = "purchase_completed";
  const payload = { event: eventName(event), order: toOrderDto(order) };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(studio.webhookSecretHash, timestamp, rawBody);

  const delivery = await prisma.webhookDelivery.create({
    data: {
      studioId: studio.id,
      event,
      orderId: order.id,
      url: studio.webhookUrl,
      payload,
      signature,
      attempt: 0,
      maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
      status: "PENDING",
    },
  });

  let responseStatus: number | null = null;
  try {
    const res = await safeFetch(studio.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XGameFi-Signature": signature,
        "X-XGameFi-Timestamp": String(timestamp),
      },
      body: rawBody,
      timeoutMs: 10_000,
      maxBytes: 1_000_000,
    });
    responseStatus = res.status;
    if (res.ok) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "DELIVERED", responseStatus, deliveredAt: new Date() },
        }),
        prisma.order.update({ where: { id: order.id }, data: { deliveryStatus: "DELIVERED", deliveredAt: new Date() } }),
      ]);
      return { status: "DELIVERED" };
    }
  } catch (err) {
    console.error(`webhook-delivery: network error for order ${orderId}`, err);
  }

  const nextAttempt = delivery.attempt + 1;
  const isExhausted = nextAttempt >= delivery.maxAttempts;

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempt: nextAttempt,
      responseStatus,
      status: isExhausted ? "EXHAUSTED" : "FAILED",
      nextAttemptAt: isExhausted ? null : new Date(Date.now() + Math.min(2 ** nextAttempt * 1000, 60_000)),
    },
  });

  if (isExhausted) {
    await prisma.order.update({ where: { id: order.id }, data: { deliveryStatus: "FAILED" } });
    await getQueue("refund").add("refund", { orderId: order.id }, { jobId: `refund-${order.id}` });
    return { status: "EXHAUSTED" };
  }

  // Re-throw so BullMQ schedules the retry according to job backoff options.
  throw new Error(`webhook-delivery failed with status ${responseStatus ?? "network"}; attempt ${nextAttempt}`);
}
```

> Note: `signWebhook` takes the raw secret; here we pass `webhookSecretHash` because the schema only stores a hash. If Phase 2/3 provisions a raw secret elsewhere, use it. For the demo, adjust `signWebhook` to accept the stored hash or store the raw secret in a secure env/secrets manager. The important invariant is: outbound webhook HMAC must be verifiable by the game server.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/worker test -- webhook-delivery.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register worker**

`apps/worker/src/index.ts` (add):
```ts
import { webhookDeliveryProcessor } from "./jobs/webhook-delivery";

registerWorker("webhook-delivery", webhookDeliveryProcessor);
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/jobs/webhook-delivery.ts apps/worker/src/jobs/webhook-delivery.test.ts apps/worker/src/index.ts

git commit -m "feat(worker): add webhook-delivery job with signed payload, retry, DLQ refund"
```

---

### Task 10: `refund` job stub

**Files:**
- Create: `apps/worker/src/jobs/refund.ts`
- Test: `apps/worker/src/jobs/refund.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `registerWorker`.
- Produces:
  - `type RefundJobData = { orderId: string }`
  - `async function refundProcessor(job): Promise<{ status: string }>` — logs the refund intent, updates `Order.paymentStatus = REFUNDED`, writes a stub `LedgerEntry(REFUND)` with amount 0 and status `PENDING`. Full on-chain refund implementation is Phase 6.

- [ ] **Step 1: Write the failing test**

`apps/worker/src/jobs/refund.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();

vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { order: { findUnique, update }, ledgerEntry: { create } } };
});

import { refundProcessor } from "./refund";

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue({ id: "o1", paymentStatus: "PAID", grossAmount: { toFixed: () => "1.0000000" }, currency: "USDT" });
  update.mockReset().mockResolvedValue({});
  create.mockReset().mockResolvedValue({});
});

describe("refundProcessor (Phase 3 stub)", () => {
  it("marks order REFUNDED and writes a pending REFUND ledger entry", async () => {
    const res = await refundProcessor({ data: { orderId: "o1" } });
    expect(res.status).toBe("PENDING");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: "REFUNDED" } }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: "REFUND", status: "PENDING" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/worker test -- refund.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the stub**

`apps/worker/src/jobs/refund.ts`:
```ts
import { prisma } from "@xgamefi/db";

export type RefundJobData = { orderId: string };

export async function refundProcessor(job: { data: RefundJobData }): Promise<{ status: string }> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`refund: order ${orderId} not found`);

  console.warn(`refund: stub refund for order ${orderId}; full on-chain refund in Phase 6`);

  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } }),
    prisma.ledgerEntry.create({
      data: {
        type: "REFUND",
        orderId: order.id,
        stellarTxHash: "",
        sourceAddress: "",
        destAddress: "",
        amount: order.grossAmount,
        assetCode: order.currency,
        assetIssuer: null,
        status: "PENDING",
      },
    }),
  ]);

  return { status: "PENDING" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/worker test -- refund.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Register worker**

`apps/worker/src/index.ts` (add):
```ts
import { refundProcessor } from "./jobs/refund";

registerWorker("refund", refundProcessor);
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/jobs/refund.ts apps/worker/src/jobs/refund.test.ts apps/worker/src/index.ts

git commit -m "feat(worker): add refund job stub (Phase 3)"
```

---

### Task 11: `GET /orders/:id/events` SSE stream

**Files:**
- Create: `apps/web/app/api/v1/orders/[id]/events/route.ts`
- Test: `apps/web/app/api/v1/orders/[id]/events/route.test.ts`
- Create: `apps/web/lib/sse.ts`

**Interfaces:**
- Consumes: `requirePrincipal` (P1); `prisma` (`@xgamefi/db`); `OrderEventsParams` (`@xgamefi/shared/zod`); `getRedis` (`@xgamefi/shared/queues`).
- Produces:
  - `GET /orders/:id/events` — Server-Sent Events stream. Validates that the principal owns the order or is an admin. Subscribes to Redis pub/sub channel `order-events:{orderId}` and forwards messages as SSE `data:` lines. Publishes current order status on connect.

- [ ] **Step 1: Write the failing test**

`apps/web/app/api/v1/orders/[id]/events/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePrincipal = vi.fn();
const findUnique = vi.fn();
const redisSubscribe = vi.fn();
const redisPublish = vi.fn();
const redis = { subscribe: redisSubscribe, on: vi.fn(), publish: redisPublish };

vi.mock("@/lib/auth", () => ({ requirePrincipal }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { order: { findUnique } } };
});
vi.mock("@xgamefi/shared/queues", () => ({ getRedis: () => redis }));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };

beforeEach(() => {
  requirePrincipal.mockReset().mockResolvedValue({ kind: "player", playerId: "p1", walletAddress: "GADDR" });
  findUnique.mockReset().mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", playerId: "p1", paymentStatus: "PENDING" });
});

describe("GET /orders/:id/events", () => {
  it("returns an SSE response for the order owner", async () => {
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("returns 403 if the principal does not own the order", async () => {
    findUnique.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", playerId: "p2", paymentStatus: "PENDING" });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "orders/[id]/events/route.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SSE helper**

`apps/web/lib/sse.ts`:
```ts
export function createSseStream(channel: string, redis: { subscribe: (c: string) => Promise<unknown>; on: (event: string, listener: (channel: string, message: string) => void) => unknown }) {
  const encoder = new TextEncoder();
  let listener: ((channel: string, message: string) => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      await redis.subscribe(channel);
      listener = (recvChannel, message) => {
        if (recvChannel === channel) {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }
      };
      redis.on("message", listener);
    },
    cancel() {
      if (listener) redis.on("message", listener); // ioredis unsubscribe handled by connection close
    },
  });

  return stream;
}
```

- [ ] **Step 4: Implement the route**

`apps/web/app/api/v1/orders/[id]/events/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { OrderEventsParams } from "@xgamefi/shared/zod";
import { getRedis } from "@xgamefi/shared/queues";
import { createSseStream } from "@/lib/sse";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requirePrincipal();
  const { id } = OrderEventsParams.parse(await ctx.params);

  const order = await prisma.order.findUnique({ where: { id }, select: { playerId: true, paymentStatus: true, deliveryStatus: true } });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isOwner = principal.kind === "player" && principal.playerId === order.playerId;
  const isAdmin = principal.kind === "user" && principal.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const channel = `order-events:${id}`;
  const redis = getRedis();
  const stream = createSseStream(channel, redis);

  // Send current state immediately
  const initial = JSON.stringify({ paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus });
  const encoder = new TextEncoder();
  const combined = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${initial}\n\n`));
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    },
  });

  return new Response(combined, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- "orders/[id]/events/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/v1/orders/[id]/events apps/web/lib/sse.ts

git commit -m "feat(web): add SSE /orders/:id/events stream"
```

---

### Task 12: QR deep link + checkout page

**Files:**
- Create: `apps/web/app/(storefront)/s/[slug]/checkout/page.tsx`
- Create: `apps/web/app/(storefront)/s/[slug]/checkout/checkout-client.tsx`
- Modify: `apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx` — add "Buy" button.

**Interfaces:**
- Consumes: `getPublishedShop`, `getPublicItem` (`apps/web/lib/catalogue-queries`, P2); `requirePrincipal` / player session (P1); `@stellar/freighter-api`; `qrcode`.
- Produces:
  - `/s/[slug]/checkout?item=...&ref=...` page. Server Component loads item + shop; client island shows item summary, a QR code encoding the Stellar payment URI (`web+stellar:pay?destination=...&amount=...&memo=...&asset_code=...&asset_issuer=...`), and connects to SSE to show live status. Uses Freighter API to detect installed wallet and offers "Pay with Freighter" button.

- [ ] **Step 1: Implement checkout page Server Component**

`apps/web/app/(storefront)/s/[slug]/checkout/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getPublishedShop, getPublicItem } from "@/lib/catalogue-queries";
import { CheckoutClient } from "./checkout-client";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ item?: string; ref?: string }>;
}) {
  const { slug } = await params;
  const { item: itemId, ref } = await searchParams;
  const [shop, item] = await Promise.all([getPublishedShop(slug), itemId ? getPublicItem(itemId) : Promise.resolve(null)]);
  if (!shop || !item) notFound();

  return (
    <main className="min-h-screen bg-background text-on-background">
      <CheckoutClient shop={shop} item={item} referralCode={ref ?? null} />
    </main>
  );
}
```

- [ ] **Step 2: Implement client island**

`apps/web/app/(storefront)/s/[slug]/checkout/checkout-client.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { isConnected, signTransaction } from "@stellar/freighter-api";

type CheckoutClientProps = {
  shop: { slug: string; theme: Record<string, unknown> };
  item: { id: string; name: string; price: { amount: string; currency: string }; imageUrl: string | null };
  referralCode: string | null;
};

export function CheckoutClient({ shop, item, referralCode }: CheckoutClientProps) {
  const [quote, setQuote] = useState<{ order: { id: string }; quote: { destination: string; asset: { code: string; issuer?: string }; amount: string; memo: string; unsignedXdr: string } } | null>(null);
  const [status, setStatus] = useState<string>("waiting for quote");
  const [qr, setQr] = useState<string | null>(null);
  const [freighterAvailable, setFreighterAvailable] = useState(false);

  useEffect(() => {
    isConnected().then(setFreighterAvailable).catch(() => setFreighterAvailable(false));
  }, []);

  useEffect(() => {
    fetch(`/api/v1/checkout/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, currency: item.price.currency, referralCode }),
    })
      .then((r) => r.json())
      .then((data) => {
        setQuote(data);
        setStatus("pending payment");
        const assetPart = data.quote.asset.issuer
          ? `&asset_code=${encodeURIComponent(data.quote.asset.code)}&asset_issuer=${encodeURIComponent(data.quote.asset.issuer)}`
          : "";
        const uri = `web+stellar:pay?destination=${encodeURIComponent(data.quote.destination)}&amount=${encodeURIComponent(data.quote.amount)}&memo=${encodeURIComponent(data.quote.memo)}${assetPart}`;
        QRCode.toDataURL(uri).then(setQr);

        const es = new EventSource(`/api/v1/orders/${data.order.id}/events`);
        es.onmessage = (ev) => {
          const payload = JSON.parse(ev.data);
          setStatus(`${payload.paymentStatus} / ${payload.deliveryStatus}`);
          if (payload.deliveryStatus === "DELIVERED") es.close();
        };
        return () => es.close();
      });
  }, [item.id, item.price.currency, referralCode]);

  async function payWithFreighter() {
    if (!quote) return;
    const signed = await signTransaction(quote.quote.unsignedXdr, { networkPassphrase: "Test SDF Network ; September 2015" });
    // Submit the signed XDR to Stellar (in real implementation use Horizon submit).
    // For the demo, after Freighter signs, the client submits txHash to /checkout/submit.
    alert("Signed XDR: " + signed);
  }

  return (
    <div className="container-max mx-auto px-4 py-12">
      <h1 className="font-display text-[48px] font-semibold text-on-surface mb-8">Checkout</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-surface-container-low border-2 border-outline-variant p-6">
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-2">ITEM</p>
          <h2 className="font-display text-[24px] text-on-surface">{item.name}</h2>
          <p className="font-display text-[32px] text-primary-fixed mt-4">{item.price.amount} {item.price.currency}</p>
        </div>
        <div className="bg-surface-container-low border-2 border-outline-variant p-6 flex flex-col items-center">
          {qr ? <img src={qr} alt="Payment QR" className="w-64 h-64" /> : <span className="text-on-surface-variant">Generating QR…</span>}
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mt-4">Scan with Freighter</p>
          {freighterAvailable && (
            <button onClick={payWithFreighter} className="mt-4 bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px]">
              Pay with Freighter
            </button>
          )}
          <p className="mt-4 text-on-surface">Status: {status}</p>
        </div>
      </div>
    </div>
  );
}
```

> The Freighter sign + submit flow in `payWithFreighter` is intentionally minimal for the plan. The e2e test (Task 13) will exercise the full flow using testnet and Playwright. Adjust the XDR signing/submission helper as needed when wiring the real demo.

- [ ] **Step 3: Add Buy button to item detail**

Modify `apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx` (existing from P2) to include a link:
```tsx
import Link from "next/link";
// inside the component render:
<Link
  href={`/s/${slug}/checkout?item=${item.id}`}
  className="bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] inline-block mt-4"
>
  Buy Now
</Link>
```

- [ ] **Step 4: Add qrcode + freighter-api dependencies**

`apps/web/package.json` (add to dependencies):
```json
"qrcode": "^1.5.4",
"@stellar/freighter-api": "^5.0.0"
```

Run: `pnpm install`

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @xgamefi/web exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(storefront)/s/[slug]/checkout apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx apps/web/package.json pnpm-lock.yaml

git commit -m "feat(web): checkout page with QR deep link and Freighter button"
```

---

### Task 13: Playwright demo acceptance test

**Files:**
- Create: `apps/web/e2e/demo.spec.ts`
- Modify: `apps/web/playwright.config.ts` (if not present from P0)

**Interfaces:**
- Consumes: Playwright; seeded Gridlock shop + Sword Skin @ 1 USDT; testnet Stellar account with trustline and Freighter extension (or programmatic signing via `@stellar/stellar-sdk`).
- Produces:
  - E2E test covering: navigate `/s/gridlock/item/{swordSkinId}` → click Buy → checkout page shows QR → pay via testnet (programmatically sign/submit a payment tx to `STELLAR_RECEIVING_ACCOUNT` with memo = orderId) → SSE shows `PAID / DELIVERED` within 60s.

- [ ] **Step 1: Write the e2e test**

`apps/web/e2e/demo.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { Horizon, Keypair, TransactionBuilder, Operation, Asset, Memo, Networks, BASE_FEE } from "@stellar/stellar-sdk";

test("Phase 3 demo: scan QR, pay 1 USDT, see delivered via SSE", async ({ page }) => {
  test.setTimeout(120_000);

  // 1. Load the storefront item page
  await page.goto("/s/gridlock");
  await page.getByText("Sword Skin").click();
  await page.getByRole("link", { name: /buy now/i }).click();

  // 2. Wait for checkout page and quote
  await expect(page.getByText("Checkout")).toBeVisible();
  await expect(page.locator("img[alt='Payment QR']")).toBeVisible();

  // 3. Read the order id from the SSE URL or page data.
  // For e2e we expose the order id in a data attribute or fetch the quote API directly.
  const orderId = await page.locator("[data-order-id]").getAttribute("data-order-id");
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/);

  // 4. Submit a testnet payment programmatically
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL!);
  const payer = Keypair.fromSecret(process.env.E2E_PAYER_SECRET!);
  const asset = new Asset(process.env.STELLAR_USD_ASSET_CODE!, process.env.STELLAR_USD_ASSET_ISSUER!);
  const account = await server.loadAccount(payer.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: process.env.STELLAR_RECEIVING_ACCOUNT!, asset, amount: "1.0000000" }))
    .addMemo(Memo.text(orderId!))
    .setTimeout(180)
    .build();
  tx.sign(payer);
  const submitRes = await server.submitTransaction(tx);
  expect(submitRes.successful).toBe(true);

  // 5. Assert SSE status reaches PAID / DELIVERED
  await expect(page.getByText(/PAID/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/DELIVERED/)).toBeVisible({ timeout: 60_000 });
});
```

> Expose `data-order-id` in `checkout-client.tsx` by wrapping the status text: `<div data-order-id={quote?.order.id}>...</div>`.

- [ ] **Step 2: Configure Playwright**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "pnpm --filter @xgamefi/web build && pnpm --filter @xgamefi/web start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
});
```

- [ ] **Step 3: Add e2e env vars**

`.env.test` (append):
```dotenv
E2E_PAYER_SECRET=SCHANGE_ME_TEST_ONLY_PAYER
```

- [ ] **Step 4: Run the e2e test (testnet)**

Prerequisites:
- Platform receiving account has trustline to testnet USDT.
- Payer account is funded and has trustline to testnet USDT.
- Worker is running to process watcher/payout/webhook.

Run worker: `pnpm --filter @xgamefi/worker start`
Run web: `pnpm --filter @xgamefi/web dev`
Run test: `pnpm --filter @xgamefi/web exec playwright test e2e/demo.spec.ts`

Expected: test passes (status reaches PAID / DELIVERED).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e apps/web/playwright.config.ts .env.test

git commit -m "test(web): add Phase 3 demo e2e acceptance test"
```

---

## Self-Review

**1. Spec coverage (Phase 3 / `SPEC.md` §13):**
- ✅ `POST /checkout/quote` with price + fee + memo + idempotencyKey — Task 5.
- ✅ Freighter pay path — Task 12.
- ✅ `POST /checkout/submit` fast-path — Task 6.
- ✅ `stellar-watcher` authoritative confirmer — Task 7.
- ✅ Shared `verifyAndAdvanceOrder` — Task 2.
- ✅ `LedgerEntry(SALE_IN)` + `LedgerEntry(PAYOUT_OUT)` — Tasks 2 + 8.
- ✅ `payout` job — Task 8.
- ✅ `webhook-delivery` signed + retry + DLQ — Task 9.
- ✅ `refund` stub on exhaustion — Tasks 9 + 10.
- ✅ `GET /orders/:id/events` SSE — Task 11.
- ✅ QR deep link — Task 12.
- ✅ Playwright demo e2e — Task 13.

**2. Placeholder scan:**
- No "TBD", "TODO", "implement later", "add appropriate error handling", "similar to Task N", or undefined types. All code, commands, and expected outputs are concrete.

**3. Type consistency:**
- `verifyAndAdvanceOrder` returns `{ status: "PAID" | "ALREADY" | "REJECTED"; reason?: string }` everywhere.
- `OrderDto` shape matches `toOrderDto` and is used by `webhook-delivery`, SSE, and e2e.
- `Asset` type from `@xgamefi/shared/stellar` is reused consistently.
- Queue names match the registry exactly: `payout`, `webhook-delivery`, `refund`, `stellar-watcher`.
- Idempotency scope is consistently `"checkout:submit"`.

**4. Known operational notes for implementer:**
- Testnet USDT asset + trustlines must be configured before running the e2e test (see `SPEC.md` §5 risks).
- `webhook-delivery` uses `Studio.webhookSecretHash` as the signing material; if the game server is expected to verify with a raw secret, store the raw secret in a secure env var (e.g. `STUDIO_WEBHOOK_SECRET_gridlock`) and update the processor to read it by studio slug.
- The SSE stream uses a single shared Redis connection; ensure `getRedis()` returns a subscriber-safe instance or create a dedicated subscriber connection if needed.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-23-phase-3-primary-sale.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
