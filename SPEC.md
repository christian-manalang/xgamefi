# xGameFi — Application Specification (SPEC.md)

> Commerce infrastructure for game studios. A studio connects its game's item system, gets a branded shop powered by Stellar, and goes live in hours — payments, fulfilment, P2P trading, referrals, and promotions handled.
>
> **Audience:** a code-expert AI agent implementing the system end to end. Read this together with `AGENT.md` (engineering rules, exact dependency versions, security checklist) and `BRAND.md` (visual system). Where this document says "see AGENT.md", that file is authoritative for *how* to build; this file is authoritative for *what* to build.

---

## 1. Product summary

Every indie studio that wants to sell in-game items has to build its own payment rail, shop UI, and delivery pipeline. xGameFi is the missing layer: connect a game's item API, get a professional Stellar-powered storefront in minutes. Players pay with any Stellar wallet; studios get paid instantly after a platform fee.

**Anchor partner / v1 target:** Gridlock Games.

**The single demo moment (must work end to end):** the presenter opens the Gridlock storefront. An audience member scans a QR code, pays **1 USDT** for a *Sword Skin* with Freighter. Within seconds the payment confirms on-chain, a signed webhook fires to Gridlock's server, the skin lands in the player's in-game inventory, and a live transaction feed shows "payment in → item delivered."

---

## 2. Actors & roles

| Role | Auth method | Capabilities |
| --- | --- | --- |
| **Platform Admin** | Username + password (seeded) | Manage studios, set default platform fee, view global ledger/metrics, suspend studios, manage platform Stellar accounts. |
| **Studio user** (owner / member) | Username + password | Manage one studio: items, shop builder, transactions, P2P, referrals, promotions, settings (API keys, webhook URL, payout wallet). |
| **Player** | Stellar wallet (Freighter) via signed challenge — no password | Browse storefront, buy items, view purchase history, list/buy in P2P market, generate referral links. |
| **Game Dev server** (machine) | API key + HMAC signature | Push item data (webhook-push mode), receive delivery webhooks, confirm grants. |

Platform/studio auth is **basic username + password only** (admin seeded via Prisma). Players are wallet-first and authenticate by signing a server-issued nonce — no account/password required, which keeps the demo frictionless.

---

## 3. High-level architecture

```
                    ┌──────────────────────────── xGameFi Platform (Railway) ─────────────────────────┐
  Player (Freighter)│   apps/web (Next.js 16, App Router)        apps/worker (BullMQ consumers)        │
        │  XLM/USDT  │   ├─ Player storefront  /s/[slug]          ├─ catalogue-sync                     │
        ▼            │   ├─ Studio dashboard   /dashboard         ├─ stellar-watcher                    │
   ┌─────────┐       │   ├─ Admin console      /admin             ├─ webhook-delivery (retry/DLQ)       │
   │ Browser │──────▶│   └─ API route handlers /api/v1/*          ├─ payout / p2p-settlement            │
   └─────────┘       │            │                               └─ referral-reward / refund           │
                     │            ▼                                                                      │
                     │   Postgres (Prisma 7)   Redis (sessions, queues, locks, rate-limit)   S3/MinIO   │
                     └───────┬─────────────────────────────────────────────┬──────────────────┬────────┘
                             │ verify tx / submit payout                    │ Get Items         │ POST webhook (HMAC)
                             ▼                                              ▼                    ▼
                     Stellar (Horizon + RPC)                       Game Dev API ◀──────── Game Dev webhook receiver
```

Two processes share one codebase: a **web** service (Next.js) and a **worker** service (queue consumers). Both talk to the same Postgres, Redis, and object store. All money settlement happens on Stellar; all item ownership of record lives in the game (xGameFi mirrors/verifies it).

---

## 4. Tech stack (summary — see AGENT.md for exact versions & rules)

Next.js (App Router, Node runtime) for frontend **and** backend route handlers; Prisma ORM on PostgreSQL (Railway); Redis (Railway) for sessions, BullMQ queues, distributed locks, idempotency and rate-limiting; S3-compatible object storage (MinIO on Railway / local) for images; Tailwind CSS v4 for styling; `@stellar/stellar-sdk` + `@stellar/freighter-api` for payments; pnpm workspaces; deployed entirely on Railway. Auth is username/password (argon2id) with httpOnly cookie sessions; players use wallet-signature sessions.

---

## 5. Data model (Prisma / PostgreSQL)

Entities and key fields. Use `Decimal` for all money, `Json` for game-specific blobs, and UUID primary keys. Every studio-scoped row carries `studioId` and **must** be filtered by it on every query (tenant isolation).

### Core identity
- **User** — `id, username (unique), passwordHash, role (ADMIN|STUDIO_OWNER|STUDIO_MEMBER), studioId?, isActive, lastLoginAt, createdAt, updatedAt`.
- **Session** — `id, userId, tokenHash (unique), userAgent, ip, expiresAt, revokedAt, createdAt`. (Mirror in Redis for fast lookup; DB row enables revocation/audit.)
- **Player** — `id, walletAddress (unique, G...), handle?, referredByPlayerId?, firstPurchaseAt?, createdAt, updatedAt`.
- **AuthChallenge** — `id, walletAddress, nonce, expiresAt, usedAt` (one-time nonce for wallet login).

### Studio & integration
- **Studio** — `id, name, slug (unique), description, logoUrl, brand (Json: primary/secondary/bg/logo overrides), payoutWalletAddress, integrationMode (API_PULL|WEBHOOK_PUSH), apiBaseUrl?, webhookUrl?, webhookSecretHash, platformFeeBps (Int, default from platform), status (PENDING|ACTIVE|SUSPENDED), createdAt, updatedAt`.
- **ApiKey** — `id, studioId, keyPrefix, hashedKey, scopes (String[]), lastUsedAt, revokedAt, createdAt`. (Issued to the studio's game server for push/confirm calls; full key shown once.)

### Catalogue & storefront
- **Item** — `id, studioId, externalId, name, description, imageUrl, priceAmount (Decimal), priceCurrency (XLM|USDT), stock (Int? null=unlimited), rarity?, category?, metadata (Json), isActive, syncedAt, createdAt, updatedAt`. Unique `(studioId, externalId)`.
- **Shop** — `id, studioId (unique), status (DRAFT|PUBLISHED), layout (Json: grid|list, sections, ordering), draftLayout (Json), theme (Json brand overrides), featuredItemIds (String[]), publishedAt, createdAt, updatedAt`.

### Orders, P2P, money
- **Order** (primary sale) — `id, studioId, itemId, playerId, quantity, currency, grossAmount, discountAmount, platformFeeAmount, netToStudioAmount, promotionId?, referralCodeUsed?, idempotencyKey (unique), stellarTxHash? (unique, nullable), paymentStatus (PENDING|PAID|FAILED|REFUNDED), deliveryStatus (PENDING|DELIVERED|FAILED), paidAt?, deliveredAt?, createdAt, updatedAt`.
- **ItemOwnership** (mirror of in-game ownership for P2P eligibility) — `id, playerId, itemId, studioId, quantity, source (PRIMARY|P2P), lockedForListingId?, acquiredAt`. Source of truth is the game; refresh via game API before trusting it.
- **P2PListing** — `id, studioId, itemId, sellerPlayerId, price (Decimal), currency, status (ACTIVE|LOCKED|SOLD|CANCELLED), lockedAt?, createdAt, updatedAt`.
- **P2PTrade** — `id, listingId, buyerPlayerId, sellerPlayerId, price, currency, platformFeeAmount, netToSellerAmount, escrowTxHash?, payoutTxHash?, status (ESCROW_PENDING|PAID|ITEM_TRANSFERRED|COMPLETED|REFUNDED|FAILED), idempotencyKey (unique), createdAt, completedAt?`.
- **LedgerEntry** — `id, type (SALE_IN|PAYOUT_OUT|P2P_ESCROW_IN|P2P_PAYOUT|REFERRAL_REWARD|REFUND), orderId?, tradeId?, referralId?, stellarTxHash, sourceAddress, destAddress, amount (Decimal), assetCode, assetIssuer?, status, createdAt`. Append-only; the financial source of truth inside the platform.

### Growth
- **Referral** — `id, code (unique), referrerPlayerId, studioId?, refereePlayerId?, status (PENDING|QUALIFIED|REWARDED|EXPIRED), qualifyingOrderId?, rewardAmount?, rewardCurrency?, rewardTxHash?, createdAt, qualifiedAt?, rewardedAt?`.
- **Promotion** — `id, studioId, name, type (PERCENT|FIXED|BUNDLE|FIRST_PURCHASE), value (Decimal), currency?, appliesToItemIds (String[]), bundleConfig (Json?), startsAt?, endsAt?, usageLimit?, usageCount, isActive, createdAt, updatedAt`.

### Operations
- **WebhookDelivery** — `id, studioId, event (purchase.completed|purchase.pending|purchase.failed|p2p.trade.completed), orderId?, tradeId?, url, payload (Json), signature, attempt, maxAttempts, status (PENDING|DELIVERED|FAILED|EXHAUSTED), responseStatus?, nextAttemptAt?, createdAt, deliveredAt?`.
- **IdempotencyKey** — `id, key (unique), scope, requestHash, responseSnapshot (Json), createdAt`.
- **AuditLog** — `id, actorType, actorUserId?, action, entityType, entityId, metadata (Json), ip, createdAt`.

A Prisma **seed script is required** to create the platform admin (`ADMIN`) and a demo Gridlock studio + a "Sword Skin" item for the demo (see §13). Password hashing with argon2id.

---

## 6. Pages (Next.js App Router)

Route groups: `(auth)`, `(admin)`, `(studio)`, `(storefront)`. Server Components by default; client components only for interactive islands (wallet connect, builder canvas, live feed). Apply the `BRAND.md` system throughout.

### Auth
| Path | Purpose |
| --- | --- |
| `/login` | Username/password for admin & studio users. |

### Platform admin `(admin)`
| Path | Purpose |
| --- | --- |
| `/admin` | GMV, fees collected, active studios, recent orders. |
| `/admin/studios` | List/approve/suspend studios; set fee. |
| `/admin/studios/[id]` | Studio detail, keys, webhook, payout wallet. |
| `/admin/users` | Platform/studio users. |
| `/admin/transactions` | Global ledger. |
| `/admin/settings` | Default fee, platform Stellar accounts, network. |

### Studio dashboard `(studio)`
| Path | Purpose |
| --- | --- |
| `/dashboard` | Revenue metrics, recent orders, delivery health. |
| `/dashboard/items` | Items synced from the game API; per-item pricing/stock/featured. |
| `/dashboard/builder` | **Shop Builder** — 3-panel editor (see §6.1). |
| `/dashboard/transactions` | All orders: player (wallet), amounts, status, tx hash. |
| `/dashboard/p2p` | Manage marketplace listings/trades for the studio's items. |
| `/dashboard/referrals` | Referral performance and payouts. |
| `/dashboard/promotions` | Create/manage promotions. |
| `/dashboard/settings` | Profile/branding, API keys, webhook URL + secret, payout wallet, integration mode. |

#### 6.1 Shop Builder layout
Three panels + live preview, per the brief: **left** = item library (synced items, draggable); **center** = shop layout canvas (drag to arrange, grid/list toggle, choose featured); **right** = item/pricing config for the selected item (price, currency, stock, sale window); **preview pane** = exact player-facing render. Actions: Save draft (`PUT …/shop/draft`), Publish (`POST …/shop/publish`). Builder canvas is a client component; persist layout as `Json`.

### Player storefront `(storefront)` — branded per studio
| Path | Purpose |
| --- | --- |
| `/s/[slug]` | Branded shop: item grid, filter, search, featured. |
| `/s/[slug]/item/[itemId]` | Item detail (description, stats, preview) — also a modal over the grid. |
| `/s/[slug]/checkout` | Freighter checkout (also reachable as a modal / from a QR deep link). |
| `/s/[slug]/me/purchases` | Wallet-gated purchase history. |
| `/s/[slug]/market` | P2P marketplace: browse & buy. |
| `/s/[slug]/market/sell` | Create a listing from owned items. |
| `/s/[slug]/referrals` | Generate/share referral link, see status. |

A QR code on the storefront / item encodes a deep link (`/s/[slug]/checkout?item=…&ref=…`) so the demo audience can scan and pay immediately.

---

## 7. API endpoints (route handlers, `/api/v1`)

All inputs validated with Zod; all responses are mapped DTOs (never raw Prisma rows). Auth column: **session** (cookie), **wallet** (player session), **apikey** (game server, HMAC-signed), **admin/studio** (role-gated). State-changing wallet/payment endpoints require an `Idempotency-Key` header.

### Auth & session
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | — | `{username,password}` → set httpOnly session cookie. Rate-limited. |
| POST | `/auth/logout` | session | Revoke session. |
| GET | `/auth/me` | session/wallet | Current principal. |
| POST | `/auth/wallet/challenge` | — | `{walletAddress}` → `{nonce}`. |
| POST | `/auth/wallet/verify` | — | `{walletAddress, signature}` → player session cookie. |

### Studios, keys, webhooks
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET/POST | `/studios` | admin | List / onboard a studio. |
| GET/PATCH | `/studios/:id` | admin or studio(self) | Profile, branding, payout wallet, fee, integration mode. |
| POST | `/studios/:id/api-keys` | studio | Issue key (returned once). |
| DELETE | `/studios/:id/api-keys/:keyId` | studio | Revoke. |
| PATCH | `/studios/:id/webhook` | studio | Set URL, rotate secret (SSRF-validated URL). |
| GET | `/studios/:id/webhooks/deliveries` | studio | Delivery log. |
| POST | `/studios/:id/webhooks/deliveries/:deliveryId/retry` | studio | Manual retry. |
| POST | `/studios/:id/webhooks/test` | studio | Send signed test event. |

### Catalogue
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/studios/:id/items` | studio | Dashboard list. |
| POST | `/studios/:id/items/sync` | studio | Trigger API-pull sync job. |
| PATCH | `/studios/:id/items/:itemId` | studio | Price/currency/stock/sale-window/featured overrides. |
| POST | `/ingest/items` | apikey | **Webhook-push** upsert from game server (HMAC-signed). |
| POST | `/ingest/delivery-confirmation` | apikey | Game server confirms async grant for an order/trade. |
| GET | `/items/:id` | public | Public item view. |

### Shop builder & storefront data
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/studios/:id/shop` | studio | Config + draft. |
| PUT | `/studios/:id/shop/draft` | studio | Save layout/theme. |
| POST | `/studios/:id/shop/publish` | studio | Publish draft. |
| GET | `/shops/:slug` | public | Published storefront config. |
| GET | `/shops/:slug/items` | public | Filter/search/paginate. |

### Checkout / primary sale
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/checkout/quote` | wallet | `{slug,itemId,qty,referralCode?}` → price breakdown (promo, fee), **destination account, asset, amount, memo**, `idempotencyKey`. Optionally returns an unsigned payment XDR. |
| POST | `/checkout/submit` | wallet | `{idempotencyKey, signedTxXdr|txHash}` → verify on-chain, create Order, enqueue payout + webhook, return status. |
| GET | `/orders/:id` | wallet/studio | Status. |
| GET | `/orders/:id/events` | wallet/studio | **SSE** stream of status transitions (drives the live demo feed). |

### P2P marketplace
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/p2p/listings` | wallet | `{itemId,price,currency}` → verify ownership via game API, lock item, publish. |
| GET | `/shops/:slug/p2p/listings` | public | Browse. |
| GET | `/p2p/listings/:id` | public | Detail. |
| DELETE | `/p2p/listings/:id` | wallet(seller) | Cancel + unlock. |
| POST | `/p2p/listings/:id/buy/quote` | wallet | → escrow account, amount, memo, idempotencyKey. |
| POST | `/p2p/listings/:id/buy/submit` | wallet | Confirm escrow payment → settle (fee, transfer, payout). |
| GET | `/p2p/trades/:id` | wallet | Trade status. |

### Referrals & promotions
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/referrals` | wallet | Generate/return the player's code. |
| GET | `/referrals/me` | wallet | Performance. |
| POST | `/referrals/bind` | wallet | Bind invitee to referrer at signup/first visit. |
| GET/POST | `/studios/:id/promotions` | studio | List/create. |
| PATCH/DELETE | `/studios/:id/promotions/:promoId` | studio | Update/remove. |

### Admin & ops
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin/metrics` | admin | Platform KPIs. |
| GET | `/admin/ledger` | admin | Global LedgerEntry feed. |
| PATCH | `/admin/settings` | admin | Default fee, Stellar accounts, network. |
| GET | `/health`, `/ready` | — | Liveness/readiness for Railway. |

---

## 8. Core flows

These mirror the system/sequence diagrams. Each money step is verified server-side on Stellar — **never trust client-reported success**.

### 8.1 Onboarding (live in hours)
1. Admin creates the studio (or studio self-onboards) and the studio user logs in.
2. Studio sets branding, payout wallet, integration mode, and either `apiBaseUrl` (pull) or pushes items via `/ingest/items` (push). On save, xGameFi validates the URL (SSRF guard) and runs a catalogue sync.
3. Studio arranges items in the Builder and publishes. Storefront is live at `/s/[slug]`.

### 8.2 Primary sale (the demo)
1. Player connects Freighter and signs the challenge → player session.
2. `POST /checkout/quote` computes gross → apply promotion → platform fee (`platformFeeBps`) → net; returns destination = platform receiving account, asset (XLM or configured USDT), amount, and a **memo binding the payment to the order** (`MEMO_TEXT` short code or `MEMO_HASH`), plus an `idempotencyKey`.
3. Player signs & submits the Stellar payment with Freighter.
4. `POST /checkout/submit` (or the `stellar-watcher` job) verifies the tx on Horizon: correct destination, asset, `amount ≥ quote`, memo matches, `txHash` unused. On success → Order `PAID`, write `LedgerEntry(SALE_IN)`.
5. Enqueue **payout** (net → studio wallet, instant) and **webhook-delivery** (`purchase.completed`). If delivery can't be confirmed synchronously, mark `purchase.pending` and retry.
6. Game server grants the item and returns 2xx (or calls `/ingest/delivery-confirmation`). Order `DELIVERED`; SSE pushes "item delivered" to the feed.
7. On delivery exhaustion → `purchase.failed` + enqueue **refund**.

### 8.3 P2P trade
1. Seller lists an owned item; xGameFi verifies ownership via the game API and locks it (`P2PListing.LOCKED`, `ItemOwnership.lockedForListingId`).
2. Buyer pays into the **platform escrow account** (memo-bound).
3. On confirmation: deduct fee → instruct game API to reassign the item buyer←seller → on success pay the seller net from escrow → `p2p.trade.completed` webhook → trade `COMPLETED`.
4. If item transfer fails → auto-refund buyer from escrow; unlock listing.

### 8.4 Referral
1. Player requests a code (`/referrals`).
2. Invitee opens the link; `/referrals/bind` ties them to the referrer (cookie + wallet).
3. On the invitee's **first qualifying purchase**, the order pipeline marks the referral `QUALIFIED` and enqueues **referral-reward**, paying the referrer automatically; status → `REWARDED`.

### 8.5 Promotions
Applied at quote time: `PERCENT` / `FIXED` reduce price; `BUNDLE` prices a set; `FIRST_PURCHASE` applies only if the player has no prior `PAID` order. Respect `startsAt/endsAt`, `usageLimit`, and `appliesToItemIds`. Discount is recorded on the Order and never recomputed client-side.

---

## 9. Background jobs (BullMQ on Redis — `apps/worker`)

| Queue | Trigger | Responsibility |
| --- | --- | --- |
| `catalogue-sync` | manual / cron | Pull items from `apiBaseUrl`; upsert; mark stale inactive. |
| `stellar-watcher` | stream/poll Horizon | Match incoming payments to platform accounts by memo; advance Orders/Trades. |
| `webhook-delivery` | order/trade events | Deliver signed events with exponential backoff (e.g. 5 attempts), then DLQ + `EXHAUSTED`. |
| `payout` | order PAID | Transfer net to studio wallet; write ledger. |
| `p2p-settlement` | escrow confirmed | Fee → item transfer → seller payout (atomic state machine). |
| `referral-reward` | referral QUALIFIED | Send reward; write ledger. |
| `refund` | delivery/transfer failure | Return funds from receiving/escrow account. |

All jobs are **idempotent** and key off the entity's current status so retries can't double-pay.

---

## 10. Game Dev API integration contract

**Pull mode** — xGameFi calls `GET {apiBaseUrl}/items` (auth header configurable) expecting `[{ externalId, name, description, imageUrl, price, currency, stock, metadata }]`.

**Push mode** — game server `POST`s the same shape to `/ingest/items` with `X-XGameFi-Key` and `X-XGameFi-Signature` (HMAC-SHA256 of timestamp + body) + `X-XGameFi-Timestamp`.

**Delivery webhook (outbound)** — xGameFi `POST`s to `studio.webhookUrl`:
```json
{
  "id": "evt_…",
  "event": "purchase.completed",
  "createdAt": "2026-06-23T12:00:00Z",
  "data": {
    "orderId": "ord_…",
    "studioId": "stu_…",
    "player": { "walletAddress": "G…" },
    "item": { "externalId": "sword_skin_01", "quantity": 1 },
    "amount": "1.0000000", "currency": "USDT",
    "stellarTxHash": "…"
  }
}
```
Headers: `X-XGameFi-Signature: t=<unix>,v1=<hmac>` over `t + "." + rawBody` using `webhookSecret`; receiver must verify with constant-time compare and reject stamps older than ~5 min. Events: `purchase.completed`, `purchase.pending`, `purchase.failed`, `p2p.trade.completed`. The game server responds `2xx` to confirm the grant; otherwise xGameFi retries.

---

## 11. Third-party services & infrastructure

| Service | Use | Notes |
| --- | --- | --- |
| **Stellar** (Horizon + RPC) | Payments, payouts, escrow, settlement | `@stellar/stellar-sdk`. Testnet for demo, Pubnet for prod. Assets: `XLM` (native) and a configured stablecoin `STELLAR_USD_ASSET_CODE`/`ISSUER` (the demo's "USDT"). Bind payments via memo. |
| **Freighter** | Browser wallet connect + signing | `@stellar/freighter-api`. Client component only. |
| **Railway** | Hosting | Services: `web`, `worker`; managed **Postgres** and **Redis**; **MinIO** service (S3-compatible) or a volume for object storage. Run migrations as a release/deploy step. |
| **S3 / MinIO** | Item images, studio logos | `@aws-sdk/client-s3` + presigned upload URLs. Local + Railway use the same S3 API. |
| **QR generation** | Demo scan-to-pay | Encode checkout deep link. |
| **Email (optional)** | Studio notifications | Resend/SMTP; not required for the demo. |

Platform Stellar accounts: a **receiving/escrow account** (collects sale + escrow funds) and a **payout signer** (sends payouts/rewards/refunds). Signer secrets live in env/secret manager — never in the DB or client.

---

## 12. Functional security requirements

(Engineering-level detail and the full checklist live in `AGENT.md`. These are the product-level invariants.)

- **Money is verified on-chain, server-side.** A sale/trade only advances after Horizon confirms destination, asset, amount, and memo, with `txHash` enforced unique.
- **Idempotency** on `checkout/submit`, `p2p buy/submit`, and `/ingest/*` so retries never double-charge or double-grant.
- **Tenant isolation**: every studio-scoped query filters by `studioId`; cross-studio access is denied.
- **Webhook/API auth** via per-studio API keys (stored hashed) and HMAC signatures with a replay window, constant-time comparison.
- **SSRF protection** on every studio-supplied URL (`apiBaseUrl`, `webhookUrl`): enforce HTTPS, resolve and block private/loopback/link-local/metadata ranges, cap timeout and response size, guard against DNS rebinding.
- **Escrow safety**: P2P funds are released only after confirmed item transfer; otherwise time-boxed auto-refund.
- **RBAC** for ADMIN/STUDIO/PLAYER; rate-limiting on auth, checkout, and listing; audit log on sensitive actions.

---

## 13. Seed & demo data (required)

Prisma seed must create: (1) an **admin** `User` from `ADMIN_USERNAME`/`ADMIN_PASSWORD` (argon2id); (2) a **Gridlock Games** studio (`slug: gridlock`) with brand colors from `BRAND.md`, a payout wallet (testnet), and a webhook secret; (3) a published shop; (4) a **"Sword Skin"** item priced `1 USDT`, plus a few extra items for the grid. This makes the demo runnable immediately after `pnpm db:seed`.

**Demo acceptance test (must pass):** open `/s/gridlock`, scan the Sword Skin QR, pay 1 USDT on testnet via Freighter → within seconds: Order `PAID` then `DELIVERED`, payout sent to Gridlock wallet, `purchase.completed` webhook delivered (signature verified), and the `/orders/:id/events` SSE feed shows "payment in → item delivered."

---

## 14. Out of scope / TBD for v1

Exact platform fee %; multi-asset/path payments and DEX routing; auctions; fiat on-ramp; mobile apps; multi-region. Stablecoin issuer must be finalized before Pubnet (the demo uses testnet with a configured asset). Treat these as configuration or follow-ups, not blockers for the demo.
