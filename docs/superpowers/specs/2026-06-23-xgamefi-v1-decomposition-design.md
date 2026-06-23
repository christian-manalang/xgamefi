# xGameFi v1 — Decomposition & Sequencing Design

> **Status:** Approved design (decomposition spine). Date: 2026-06-23.
>
> This document does **not** restate the product design — that lives in `SPEC.md` (what to build), `AGENT.md` (how to build + security bar), and `BRAND.md` (visual system), which remain authoritative. This spec decomposes v1 into an ordered sequence of independently shippable phases and locks the cross-cutting architecture decisions every phase depends on. **Each phase gets its own implementation plan** (via the writing-plans flow) when we reach it.

---

## 1. Goal & framing

Deliver the full v1 described in `SPEC.md`, built as a sequence of phases. The **single demo moment** (`SPEC.md` §1/§13 — scan QR → pay 1 USDT with Freighter → on-chain confirm → signed webhook → item delivered → live SSE feed) is the spine: the first four phases (0→3) are the shortest correct path to it, and everything after layers onto a working, verified payment core without reworking it.

Money-critical and trust-boundary infrastructure (Stellar verify, fee math, HMAC, SSRF guard, idempotency, ledger) lands early (Phases 0 and 3) so later phases reuse a single implementation rather than reinventing it.

**Scope of this effort:** all of v1, sequenced. Out-of-scope items remain those in `SPEC.md` §14 (exact fee %, DEX/path payments, auctions, fiat on-ramp, mobile, multi-region, final pubnet stablecoin issuer).

---

## 2. Phase map (build order)

Each phase is independently shippable and testable and is a prerequisite of the next within the demo path (0→1→2→3). Phases 4–7 layer onto the payment core in priority order.

| # | Phase | Delivers | Acceptance gate |
|---|-------|----------|-----------------|
| **0** | **Foundations** | pnpm monorepo (`apps/web`, `apps/worker`, `packages/db\|shared\|config`); Prisma 7 schema + pg adapter + seed; `packages/shared` (Zod, money/`bignumber`, Stellar helpers, HMAC, SSRF guard); docker-compose (PG17/Redis7/MinIO); env-at-boot validation; Tailwind v4 `@theme` from BRAND.md; `/api/health` + `/api/ready`; CI (lint/tsc/test/audit/migrate-diff). | `pnpm db:seed` creates admin + Gridlock + Sword Skin; both services boot; CI green. |
| **1** | **Auth & tenancy** | Username/password (argon2id) + Redis/DB sessions; wallet challenge/verify for players; central RBAC guard; `studioId` scoping; rate-limit; AuditLog; `proxy.ts` coarse gate + in-handler authZ (defense in depth). | Admin logs in; player signs Freighter challenge → player session. |
| **2** | **Catalogue + storefront (read)** | Item model; pull-sync (`catalogue-sync`) + push `/ingest/items` (HMAC); studio items dashboard with overrides; published shop config; public branded `/s/[slug]` grid + item detail. | `/s/gridlock` renders the seeded shop; Sword Skin visible. |
| **3** | **★ Primary sale (THE DEMO)** | `checkout/quote` (price + fee + memo + idempotencyKey); Freighter pay; `checkout/submit` + **`stellar-watcher`** on-chain verify; Order state machine; `LedgerEntry`; `payout` job; `webhook-delivery` (signed, retry/DLQ); `/orders/:id/events` **SSE** feed; QR deep link. | **`SPEC.md` §13 acceptance test passes end-to-end on testnet** (Playwright e2e). |
| **4** | **Shop Builder** | 3-panel builder (library / canvas / config) + live preview; draft/publish; per-item pricing/stock/featured/sale-window overrides. | Studio rearranges + publishes; storefront reflects it. |
| **5** | **Growth** | Promotions (PERCENT/FIXED/BUNDLE/FIRST_PURCHASE) applied at quote; referrals (code/bind/qualify) + `referral-reward` job. | Discounted order + auto referral payout, both ledgered. |
| **6** | **P2P marketplace** | Ownership-verified listings (locked); escrow buy; `p2p-settlement` state machine (fee → item transfer → seller payout, time-boxed auto-refund); `refund` job; market pages. | `p2p.trade.completed` end-to-end; failed transfer auto-refunds. |
| **7** | **Admin & ops hardening** | Admin metrics/ledger/settings/studios/users; webhook delivery log/retry/test; full audit + rate-limit coverage; Railway deploy config + release-step migrations; demo e2e wired into CI. | Admin console live; Playwright demo e2e green in CI. |

**Why this order:** 0→3 is the minimal critical path to the value-proving demo, each phase a hard prerequisite of the next. Phase 3 establishes the money core (verify/ledger/idempotency/jobs/webhooks); Phases 4–7 reuse it. Growth (5) precedes P2P (6) because it is lower-risk and shares the existing primary-sale pipeline, whereas P2P introduces escrow and a new settlement state machine.

---

## 3. Cross-cutting architecture (all phases)

These are the spine decisions the whole system hangs on. Most are dictated by `AGENT.md`; the few implied choices are made explicit here.

### 3.1 Monorepo & code sharing
Two runtime apps (`apps/web` = Next.js 16 UI + `/api/v1` route handlers; `apps/worker` = BullMQ consumers) over shared packages. **All money-critical and trust-boundary logic lives in `packages/shared`** — Stellar verify, fee/discount math, HMAC sign/verify, SSRF guard, Zod input schemas, DTO mappers — so web and worker run one implementation. `packages/db` owns the single Prisma client (pg driver adapter) and the seed. `packages/config` owns shared eslint/tsconfig/tailwind presets and the Zod env schema.

### 3.2 Money flow & sources of truth
- **On-chain (Stellar)** is the source of truth for *settlement*.
- **The game** is the source of truth for *item ownership* (xGameFi mirrors/verifies via `ItemOwnership`, refreshed from the game API before trusting it for P2P).
- **`LedgerEntry`** (append-only) is the platform's internal financial record.
- All monetary values are `Prisma.Decimal` / `bignumber.js`, formatted to 7 dp for Stellar (stroops); fees computed deterministically from `platformFeeBps`. **No JS `number` for money, ever.**

### 3.3 Payment verification — watcher-primary
`POST /checkout/submit` is a *fast-path nudge* (verifies immediately when it can); the **`stellar-watcher`** (streams Horizon for the platform receiving account, matches by memo) is the authoritative confirmer so a closed browser never strands a paid order — critical for the live demo. Both call one shared `verifyAndAdvance(entity, tx)` that, inside a `prisma.$transaction`, checks: destination = platform account, asset matches (`XLM` native or configured issuer/code), `amount ≥ quoted`, **memo binds to the order/trade**, and `txHash` is unused (DB-unique). Only then advance state, write `LedgerEntry`, and enqueue downstream jobs. Idempotent on entity status, so submit-and-watcher racing cannot double-process.

### 3.4 Idempotency & background jobs
`IdempotencyKey` table + Redis guards on `checkout/submit`, `p2p buy/submit`, and `/ingest/*`. Every BullMQ job (`catalogue-sync`, `stellar-watcher`, `webhook-delivery`, `payout`, `p2p-settlement`, `referral-reward`, `refund`) keys off the entity's **current status**, not the trigger, so retries and DLQ replays cannot double-pay or double-grant.

### 3.5 Trust boundaries
- **SSRF guard (mandatory):** studio-supplied URLs (`apiBaseUrl`, `webhookUrl`) leave the box only through the centralized guard — HTTPS-only; reject private/loopback/link-local/cloud-metadata ranges; pin resolved IP against DNS rebinding; strict timeout + response-size cap; no redirects to disallowed hosts. No raw `fetch`/POST to a studio URL anywhere.
- **HMAC:** inbound `/ingest/*` and outbound webhooks use HMAC-SHA256 over `timestamp + "." + rawBody` with a ±5-min replay window and constant-time compare. Header: `X-XGameFi-Signature: t=<unix>,v1=<hmac>`.

### 3.6 Auth & RBAC
One central guard maps `ADMIN` / `STUDIO_OWNER`|`STUDIO_MEMBER` / `PLAYER` → allowed resources; studio-scoped queries are **always** re-scoped by `studioId` in the handler/action (never trusting `proxy.ts` alone — multiple middleware/proxy bypass CVEs). Platform/studio = username + password (argon2id), opaque session id in httpOnly+Secure+SameSite=Lax cookie, mirrored in Redis with a `Session` row for revocation/audit. Players = wallet-signature session only (one-time time-boxed nonce). CSRF via SameSite + Origin/Referer check on cookie-authenticated mutations and Server Actions. Rate-limit auth/checkout/listing in Redis; login backoff; `AuditLog` on sensitive actions (no passwords/secrets).

### 3.7 Testing posture (per `AGENT.md` §10 / §14 DoD)
- **Unit** (`packages/shared`, written first): fee/discount math, money rounding, HMAC sign/verify, SSRF guard (must reject metadata IP + DNS rebinding), promotion logic.
- **Integration:** route handlers against a disposable Postgres (Testcontainers/compose) + Prisma; mock Horizon or use testnet.
- **E2E (Playwright):** the **Phase-3 demo path** is the headline acceptance gate and runs in CI from Phase 7.
- **CI gate:** `pnpm lint`, `tsc --noEmit`, `pnpm test`, `prisma migrate diff` drift check, `pnpm audit` (fail on high/critical). Type-check green or no merge.

---

## 4. Phase 0–3 detail (path to the demo)

Phases 4–7 are well-specified in `SPEC.md` and are kept at the phase-map level here; detailing them now would be speculative. Each is expanded into a full implementation plan when reached.

### Phase 0 — Foundations
- **Workspace:** `pnpm-workspace.yaml`, root scripts; `packages/config` with shared eslint/tsconfig/tailwind presets and the Zod **env schema** parsed at boot in both apps (fail-fast on missing/invalid values; matching `.env.test`).
- **`packages/db`:** the full Prisma 7 schema for **all** `SPEC.md` §5 entities up front (cheaper than migrating piecemeal); `prisma.config.ts` (loads env itself) + pg driver adapter; single `PrismaClient`; `db:seed` creating admin (argon2id from `ADMIN_USERNAME`/`ADMIN_PASSWORD`), Gridlock studio (`slug: gridlock`, BRAND colors, testnet payout wallet, webhook secret), a published shop, and a "Sword Skin" @ 1 USDT plus filler items.
- **`packages/shared`:** skeletons with **tests first** for the pure pieces — money utils (`bignumber`, 7-dp formatting, fee-from-bps), HMAC sign/verify, SSRF guard, Stellar helpers (build payment XDR; parse/verify Horizon tx).
- **`apps/web`:** Next 16 App Router shell; Tailwind v4 `@theme` from `BRAND.md` in `app/globals.css`; `next/font` (Space Grotesk + JetBrains Mono) + Material Symbols; security headers (CSP/HSTS/etc.) via config/proxy; `/api/health` (liveness) + `/api/ready` (DB+Redis readiness).
- **`apps/worker`:** BullMQ + ioredis bootstrap; queue registry (stubs for all SPEC §9 queues).
- **Infra:** `docker-compose.yml` (Postgres 17, Redis 7, MinIO + createbuckets); `.env.example` (every var, no secrets); CI pipeline.

### Phase 1 — Auth & tenancy
`/auth/login`, `/auth/logout`, `/auth/me`, `/auth/wallet/challenge`, `/auth/wallet/verify`. One-time time-boxed `AuthChallenge` nonce; Freighter signature verified server-side; player session cookie bound to wallet. Central RBAC guard + `studioId` re-scope helper used by every studio query. CSRF protection on cookie mutations/Server Actions. Redis rate-limit on auth; login backoff; `AuditLog` writes. `proxy.ts` coarse auth gate (never the sole check).

### Phase 2 — Catalogue + storefront (read)
`Item` populated via sync: `catalogue-sync` job (pull from `apiBaseUrl` **through the SSRF guard**, upsert by `(studioId, externalId)`, mark stale items inactive) and `/ingest/items` push (API key + HMAC + timestamp + idempotency). Studio `/dashboard/items` with per-item price/currency/stock/featured/sale-window overrides. Public `GET /shops/:slug` + `GET /shops/:slug/items` (filter/search/paginate) → server-rendered branded `/s/[slug]` grid + `/s/[slug]/item/[itemId]` (page and modal). DTO mappers only — never raw Prisma rows.

### Phase 3 — Primary sale (THE DEMO)
- **`POST /checkout/quote`** (wallet): gross → platform fee (`platformFeeBps`) → net; returns destination (platform receiving account), asset (`XLM` or configured USDT), amount, **memo binding to the order**, `idempotencyKey`, and optionally an unsigned payment XDR. Creates Order `PENDING`.
- Player signs + submits the Stellar payment via Freighter.
- **`POST /checkout/submit`** records `txHash` and attempts immediate `verifyAndAdvance`.
- **`stellar-watcher`** streams Horizon for the receiving account, matches by memo, runs the same `verifyAndAdvance` → Order `PAID`, `LedgerEntry(SALE_IN)`, enqueue `payout` + `webhook-delivery`.
- **`payout`** job: net → studio payout wallet (signer secret from env/secret manager, never DB/client/logs); `LedgerEntry(PAYOUT_OUT)`.
- **`webhook-delivery`** job: signed `purchase.completed` with exponential backoff (≤5 attempts) → DLQ + `EXHAUSTED`; persist every attempt in `WebhookDelivery`. Game `2xx` (or `/ingest/delivery-confirmation`) → Order `DELIVERED`; if delivery can't be confirmed → `purchase.pending`; on exhaustion → `purchase.failed` + enqueue `refund`.
- **`GET /orders/:id/events`** SSE streams status transitions → live "payment in → item delivered" feed.
- QR on storefront/item encodes `/s/gridlock/checkout?item=…&ref=…`.
- **Gate:** `SPEC.md` §13 acceptance test green on testnet, implemented as the Playwright demo e2e.

---

## 5. Known risks & dependencies

- **Missing mock HTML.** `BRAND.md` is "derived from the provided mock storefront/builder/marketplace HTML," which is not in the repo. UI will be designed purely from `BRAND.md` tokens/patterns; if the mock is supplied later it would sharpen the builder/storefront work (Phases 2 and 4). Not a blocker.
- **Testnet USDT asset + trustlines.** The demo's "USDT" is a configured testnet asset (`STELLAR_USD_ASSET_CODE`/`ISSUER`); the platform receiving account and the demo player wallet need trustlines to it before the §13 test can pass. Operational setup tracked in Phase 3.
- **Pubnet stablecoin issuer** is unresolved (`SPEC.md` §14) — a pre-pubnet config decision, not a demo blocker.
- **Stellar signer key custody.** Demo uses env-held testnet signer; production should move to a secret manager/KMS (`AGENT.md` §8).

---

## 6. Per-phase next step

Each phase is expanded into its own implementation plan via the writing-plans flow at the time it is built, gated on the prior phase's acceptance criterion. Phase 0's implementation plan is the immediate next artifact.
