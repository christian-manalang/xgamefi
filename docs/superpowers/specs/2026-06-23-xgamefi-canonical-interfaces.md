# xGameFi — Canonical Interface Contract

> Shared reference for every phase implementation plan. When a plan task consumes or produces a cross-phase interface, it MUST use the exact names, module paths, and signatures below. This keeps 8 independently-authored plans consistent. Phase that first *creates* each interface is noted in brackets.

## Workspace package names
- `@xgamefi/config` — eslint/tsconfig/tailwind presets + env schema. [P0]
- `@xgamefi/db` — Prisma client + schema + seed. [P0]
- `@xgamefi/shared` — money, hmac, ssrf, stellar, zod, dto, auth helpers. [P0]
- `apps/web` (`@xgamefi/web`), `apps/worker` (`@xgamefi/worker`).

## Env [P0]
- `import { env } from "@xgamefi/config/env"` — validated Zod object. Throws at import if invalid. Keys exactly per `AGENT.md` §12 (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `STELLAR_*`, `PLATFORM_FEE_BPS`, `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_TIMESTAMP_TOLERANCE_SEC`, S3 vars, `ADMIN_USERNAME`/`ADMIN_PASSWORD`, etc.).

## Database [P0]
- `import { prisma } from "@xgamefi/db"` — single `PrismaClient` (pg driver adapter).
- `import { Prisma } from "@xgamefi/db"` — for `Prisma.Decimal` and generated enums.
- All money columns are `Decimal`. All ids are `uuid`.

## Money — `@xgamefi/shared/money` [P0]
```ts
function feeAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal      // deterministic, rounded down to 7dp
function netAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal      // gross - feeAmount
function toStellarAmount(v: Prisma.Decimal): string                          // "1.0000000" (exactly 7dp)
function fromStellarAmount(s: string): Prisma.Decimal
```

## HMAC — `@xgamefi/shared/hmac` [P0]
```ts
function signWebhook(secret: string, timestampSec: number, rawBody: string): string  // returns "t=<unix>,v1=<hex>"
function verifyHmac(args: { secret: string; header: string; rawBody: string; toleranceSec: number }): boolean  // constant-time, rejects skew > toleranceSec
```

## SSRF guard — `@xgamefi/shared/ssrf` [P0]
```ts
function assertPublicUrl(rawUrl: string): Promise<URL>   // HTTPS-only; rejects private/loopback/link-local/metadata; returns URL with resolved IP pinned
function safeFetch(rawUrl: string, init?: RequestInit & { maxBytes?: number; timeoutMs?: number }): Promise<Response>  // uses assertPublicUrl, pins IP (no DNS rebind), caps size+timeout, no cross-host redirects
```

## Stellar — `@xgamefi/shared/stellar` [P0]
```ts
type Asset = { code: "XLM" } | { code: string; issuer: string }
function buildPaymentXdr(args: { destination: string; asset: Asset; amount: string; memo: string; source: string }): Promise<string>
type VerifyResult = { ok: true; txHash: string; amount: Prisma.Decimal; memo: string; asset: Asset } | { ok: false; reason: string }
function verifyPayment(args: { txHash?: string; expectedDestination: string; expectedAsset: Asset; minAmount: Prisma.Decimal; expectedMemo: string }): Promise<VerifyResult>  // queries Horizon
function sendPayment(args: { destination: string; asset: Asset; amount: string; memo?: string }): Promise<{ txHash: string }>  // signs with env payout signer
```

## DTO mappers — `@xgamefi/shared/dto` [P0+]
Each phase adds `toXDto(row): XDto`. Never return raw Prisma rows from a handler. Mappers are pure.

## Zod schemas — `@xgamefi/shared/zod` [P0+]
Shared request/response schemas live here; each phase adds its own (e.g. `LoginInput`, `CheckoutQuoteInput`).

## Auth & RBAC — `@xgamefi/shared/auth` + `apps/web/lib/auth` [P1]
```ts
type Principal = { kind: "user"; userId: string; role: "ADMIN"|"STUDIO_OWNER"|"STUDIO_MEMBER"; studioId?: string } | { kind: "player"; playerId: string; walletAddress: string }
async function getPrincipal(): Promise<Principal | null>             // reads session cookie (await cookies())
async function requirePrincipal(): Promise<Principal>                // throws 401
async function requireRole(...roles): Promise<Principal>             // throws 403
async function requireStudio(studioId: string): Promise<Principal>   // 403 unless ADMIN or member of studioId
function scopeToStudio(principal, studioId): void                    // throws unless allowed; use before every studio query
```

## Verify-and-advance — `@xgamefi/shared/settlement` [P3]
```ts
// Single authoritative confirmer shared by checkout/submit (web) and stellar-watcher (worker).
async function verifyAndAdvanceOrder(args: { orderId: string; txHash: string }): Promise<{ status: "PAID"|"ALREADY"|"REJECTED"; reason?: string }>
// Runs inside prisma.$transaction: verifyPayment + txHash uniqueness; idempotent on Order.paymentStatus; on first PAID writes LedgerEntry(SALE_IN) and enqueues payout + webhook-delivery.
```

## Queues — `@xgamefi/shared/queues` (names) [P0 registry, filled per phase]
`catalogue-sync` [P2], `stellar-watcher` [P3], `webhook-delivery` [P3], `payout` [P3], `p2p-settlement` [P6], `referral-reward` [P5], `refund` [P3 stub / P6 full]. Each job is idempotent and keys off the entity's current status. Queue/connection bootstrap exported as `getQueue(name)` / `registerWorker(name, processor)`.

## Idempotency — `@xgamefi/shared/idempotency` [P3]
```ts
async function withIdempotency<T>(args: { key: string; scope: string; requestHash: string }, fn: () => Promise<T>): Promise<T>  // IdempotencyKey table + Redis lock; replays stored responseSnapshot
```

## API conventions (all phases)
- Route handlers under `apps/web/app/api/v1/...`; validate inputs with Zod; return mapped DTOs; never raw Prisma rows or stack traces.
- State-changing wallet/payment endpoints require an `Idempotency-Key` header.
- Studio-scoped queries always pass through `scopeToStudio`.
- HMAC header name: `X-XGameFi-Signature: t=<unix>,v1=<hmac>`; key header `X-XGameFi-Key`; timestamp `X-XGameFi-Timestamp`.
