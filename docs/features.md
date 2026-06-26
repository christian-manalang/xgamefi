# Features Log

A running log of shipped features. Append one entry per change (newest first).

## Storefront wallet connect button (#126)

Added a player-facing wallet connect control to the storefront so authenticated players can complete checkout and P2P flows.

- **Problem:** The checkout and marketplace endpoints require a player principal (`requirePrincipal` with `kind === 'player'`), but the storefront had no UI to authenticate with a Stellar wallet. This caused checkout to fail with `UNAUTHENTICATED` / `quote failed` before a QR could be generated.
- **Component:** `apps/web/app/(storefront)/_components/wallet-connect.tsx` — client island that detects Freighter, requests access, fetches a nonce from `/api/v1/auth/wallet/challenge`, signs `xGameFi login\naddress: {addr}\nnonce: {nonce}` with Freighter, and verifies via `/api/v1/auth/wallet/verify`. It polls `/api/v1/auth/me` to show connected state and supports disconnect via `/api/v1/auth/logout`.
- **Layout:** `apps/web/app/(storefront)/layout.tsx` — adds a storefront header containing the `WalletConnect` island so the control is available on every storefront page.
- **Tests:** `apps/web/app/(storefront)/_components/wallet-connect.test.tsx` covers Freighter-not-installed, unauthenticated connect, already-authenticated display, and the full challenge/verify flow.

## Docker full-stack build fix (#124)

Fixed `docker compose up -d --build` failing during image build when `pnpm db:generate` could not resolve the `prisma` CLI inside `packages/db`.

- **Root cause:** With pnpm's isolated linker, the first `pnpm install --frozen-lockfile` ran before the full workspace source was copied, leaving a dangling `packages/db/node_modules/prisma` symlink.
- **Fix:** Added a second `RUN pnpm install --frozen-lockfile` after `COPY . .` in `Dockerfile` so workspace symlinks are reified against the complete source tree, plus moved `prisma` from `devDependencies` to `dependencies` in `packages/db/package.json` because the CLI is required at runtime by the `migrate` and `seed` targets.

## Sprint 7 — Admin & Ops (#97–#112)

Admin console, platform governance, and operational hardening for the xGameFi backend.

- **Admin console pages (#108):** `apps/web/app/(admin)/admin/*` — server-side RBAC-gated layout + overview, studios, studio detail, users, global ledger, and platform-settings pages styled to `BRAND.md`; gated by `requireRole("ADMIN")` with `/login` redirect.
- **Security hardening (#109):** `RATE_LIMITED_PATHS` + rate-limit coverage test for auth/checkout/listing routes; `securityHeaders()` in `apps/web/proxy.ts` applying CSP/HSTS/nosniff/referrer-policy/frame-ancestors, with a coarse admin gate.
- **Railway deploy config (#110):** `railway.web.json` + `railway.worker.json` with frozen-lockfile builds, Prisma generate, and a release step that runs `prisma migrate deploy` + `prisma generate` (no auto-seed); health check on `/api/health`.
- **CI e2e headline gate (#111, #119):** `.github/workflows/ci.yml` now ends with the Phase-3 Playwright demo spec; `demo.spec.ts` is self-contained using a friendbot-funded testnet XLM wallet + player auth + `currency=XLM` override, so it passes without real money, custom assets, or repository secrets.
- **Full-suite green + audit coverage (#112):** `auditCoverage.test.ts` asserts every sensitive admin/studio handler calls `writeAudit` with its action string; the whole monorepo passes lint, typecheck, and 342 tests plus the headline e2e.

## Sprint 6 — P2P Marketplace (#85–#96)

Player-to-player marketplace on the Phase-3 money core: ownership-verified listings, escrow-pay, a settlement state machine that transfers the item and pays the seller net of fees, auto-refund on failure, and a signed `p2p.trade.completed` webhook — all ledgered.

- **Schema relations (#85):** migration `20260624000000_p2p_relations` — `P2PListing.item`, `P2PTrade.buyer/seller`, `ItemOwnership.item/lockedForListing`, back-relations, and `ItemOwnership @@unique([playerId, itemId])` for `(playerId, itemId)` upserts.
- **P2P DTOs + Zod (#86):** `@xgamefi/shared/dto/p2p` (`toP2PListingDto`/`toP2PTradeDto`, 7-dp money) and `@xgamefi/shared/zod/p2p` (`CreateListingInput`, `P2PTradeQuoteInput`, `P2PTradeSubmitInput`, `P2PListingsQuery`).
- **Ownership verification (#87):** `@xgamefi/shared/p2p/ownership` — `refreshOwnership`/`assertOwnsItem` pull the player's inventory from the studio's game API through the SSRF guard and upsert the `ItemOwnership` row.
- **P2P settlement core (#88):** `@xgamefi/shared/p2p/settlement` — `verifyAndAdvanceP2PTrade` (on-chain escrow verify → `P2P_ESCROW_IN` ledger → `PAID` → enqueue transfer) and `transferItemAndPayout` (HMAC-signed game transfer → seller payout → `P2P_PAYOUT` ledger → `COMPLETED`/listing `SOLD`/ownership move, or `refund` on transfer failure).
- **Create listing (#89):** `POST /p2p/listings` — player-auth, verifies ownership, creates an `ACTIVE` listing and locks the ownership row (`apps/web/lib/p2p-queries.ts`).
- **Public market endpoints (#90):** `GET /p2p/listings/query?slug=…` (published-shop-scoped, paginated, `ACTIVE` only) and `GET /p2p/listings/:id`.
- **Trade quote + submit (#91):** `POST /p2p/trades/quote` (locks listing, creates `ESCROW_PENDING` trade, returns escrow address/memo/unsigned XDR) and `POST /p2p/trades/submit` (idempotent, calls `verifyAndAdvanceP2PTrade`).
- **p2p-settlement worker (#92):** `p2pSettlementProcessor` — `transfer` phase runs `transferItemAndPayout`; verify phase polls Horizon for escrow payments matching `ESCROW_PENDING` trade memos; registered in the worker queue map.
- **Refund job (#93):** replaced the Phase-3 stub — refunds an Order or a P2P trade buyer on-chain from the platform account, writes a `CONFIRMED` `REFUND` ledger entry, flips status to `REFUNDED` (branches on `orderId`/`tradeId` so legacy `{ orderId }` callers still work).
- **Webhook `p2p_trade_completed` (#94):** `webhook-delivery` now resolves studio/url/secret/payload for either an order or a trade, signs and delivers; P2P exhaustion does not refund (the trade already settled).
- **Market UI (#95):** `/s/[slug]/market` grid + `/s/[slug]/market/listing/[id]` detail with a Freighter/QR `BuyClient` island.
- **Acceptance (#96):** `apps/web/test/acceptance/phase6-p2p.test.ts` — list → quote → escrow verify → transfer → payout, asserting `P2P_ESCROW_IN` + `P2P_PAYOUT` ledger entries, `COMPLETED` trade, `SOLD` listing, and moved ownership; plus a testnet-gated Playwright `e2e/p2p.spec.ts`.

## Sprint 5 — Growth (#75–#84)

Promotions and a referral program: server-side discounting at quote time and automatic, idempotent referrer payouts on a referred player's first purchase.

- **Promotion math (#75):** `@xgamefi/shared/promotions` — `applyPromotion` pure discount/eligibility for `PERCENT`/`FIXED`/`BUNDLE`/`FIRST_PURCHASE`, honoring `startsAt`/`endsAt`, `usageLimit`/`usageCount`, `appliesToItemIds`, with floored 7-dp money.
- **Promotion & referral DTOs (#76):** `@xgamefi/shared/dto` — `toPromotionDto`, `toReferralDto`, `toReferralPerformanceDto` + Zod schemas for promotion/referral input.
- **Promotions studio CRUD (#77):** `GET/POST /studios/:id/promotions`, `PATCH/DELETE /studios/:id/promotions/:promoId` — tenant-isolated promotion management.
- **Promotion at quote time (#78):** `createOrderQuote` applies the best eligible promotion inside its transaction — fee charged on the discounted price, discount + `promotionId` recorded on the `Order`, `usageCount` incremented; never recomputed client-side.
- **Referral endpoints (#79):** `POST /api/v1/referrals` (generate), `GET /api/v1/referrals/me` (performance), `POST /api/v1/referrals/bind` — one code per referrer, idempotent bind of the invitee.
- **Referral-reward worker (#80):** `referral-reward` job — pays the referrer via `sendPayment`, writes `LedgerEntry(REFERRAL_REWARD)`, flips the referral to `REWARDED`; idempotent on `status=QUALIFIED`.
- **Referral qualification hook (#81):** `verifyAndAdvanceOrder` — on the invitee's first PAID order, flips their `PENDING` referral to `QUALIFIED` (sets `qualifyingOrderId`, `qualifiedAt`, `studioId`) and enqueues `referral-reward`, all inside the settlement transaction.
- **Player referral page (#82):** `/s/[slug]/referrals` — server shell + `ReferralPanel` island that generates the code, builds a share link `${APP_BASE_URL}/s/${slug}?ref=…`, and shows invited/qualified/rewarded counts.
- **Studio growth dashboards (#83):** `/dashboard/promotions` (`PromotionsManager` list/create island over the Task-3 API) and `/dashboard/referrals` (referral activity + `REFERRAL_REWARD` payout history, RBAC-gated, studio-scoped).
- **Acceptance gate (#84):** `apps/web/test/acceptance/phase5-growth.test.ts` — a discounted order computes discount + fee server-side and the invitee's first purchase auto-pays the referrer, both ledgered (`SALE_IN` + `REFERRAL_REWARD`), with reward-job idempotency.

## Sprint 4 — Shop Builder (#61–#74)

Studio drag-and-drop shop builder with a live player-facing preview, draft/publish workflow, and storefront contract confirmation.

- **ShopLayout Zod schema & types (#61):** `packages/shared/src/zod/shop` — `ShopLayoutSchema`, `ShopThemeSchema`, `ShopDraftInputSchema` and inferred types; single source of truth for layout, theme, sections and draft input.
- **ShopDto studio view (#62):** `packages/shared/src/dto/shop` — `toShopDto` now exposes `id`, `slug` and `draftLayout` for the builder page.
- **Storefront contract guard (#63):** `apps/web/app/(storefront)/s/[slug]/StorefrontGrid.tsx` — presentational grid/list renderer that consumes `layout`/`theme`/`featuredItemIds`; shared by the public storefront and builder preview.
- **Draft handler (#64):** `PUT /api/v1/studios/:id/shop/draft` — validates `ShopDraftInputSchema`, persists `draftLayout`/`theme`/`featuredItemIds`.
- **Publish handler (#65):** `POST /api/v1/studios/:id/shop/publish` — validates saved `draftLayout`, promotes it to `layout`, sets `PUBLISHED` + `publishedAt`.
- **Builder page (#66):** `apps/web/app/(studio)/dashboard/builder/page.tsx` — server component loads the principal's shop + active items and renders the builder island.
- **Builder store (#67):** `apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.ts` — typed reducer for `SET_MODE`, `ADD_ITEM`, `REMOVE_ITEM`, `REORDER`, `TOGGLE_FEATURED`, `SELECT_ITEM`.
- **ItemLibrary panel (#68):** `apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.tsx` — `w-80` right column of draggable synced items with ADD fallback.
- **LayoutCanvas panel (#69):** `apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.tsx` — center drop target with grid/list toggle, featured/remove controls.
- **ItemConfigPanel (#70):** `apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.tsx` — `w-64` left tools column reusing `PATCH /studios/:id/items/:itemId` for price/currency/stock/sale-window.
- **StorefrontPreview (#71):** `apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.tsx` — wraps the shared `StorefrontGrid` so preview == player output.
- **ShopBuilder island (#72):** `apps/web/app/(studio)/dashboard/builder/ShopBuilder.tsx` — three-column shell (`w-64` · fluid · `w-80`) with drag-and-drop, save-draft, publish and `motion-safe` reduced-motion gating.
- **E2E acceptance (#73):** `apps/web/e2e/shop-builder.spec.ts` — Playwright gate proving add → feature → list → publish → `/s/gridlock` reflects.
- **Dashboard nav + verification (#74):** `apps/web/app/(studio)/dashboard/_components/SideRail.tsx` + dashboard layout — adds BUILDER link; full phase lint/typecheck/test pass.

## Sprint 3 — Primary Sale / The Demo (#48–#60)

End-to-end Stellar payment flow from storefront quote through settlement, payout, webhook delivery, and real-time SSE status.

- **Order DTO + checkout schemas (#48):** `@xgamefi/shared/dto/order` — `toOrderDto` with 7-dp amount serialization; `@xgamefi/shared/zod/checkout` — `CheckoutQuoteInput` / `CheckoutSubmitInput`; `@xgamefi/shared/zod/order` — `OrderEventsParams`.
- **Shared settlement confirmer (#49):** `@xgamefi/shared/settlement` — `verifyAndAdvanceOrder` runs inside a Prisma transaction, calls `verifyPayment`, writes `LedgerEntry(SALE_IN)`, and enqueues `payout` + `webhook-delivery`.
- **Idempotency helper (#50):** `@xgamefi/shared/idempotency` — Redis-backed lock + `IdempotencyKey` snapshot replay via `withIdempotency`.
- **Queue registry (#51):** `@xgamefi/shared/queues` — `QUEUE_NAMES` / `QueueName`, `getRedis()`, and BullMQ queue bootstrap.
- **Checkout quote API (#52):** `POST /api/v1/checkout/quote` — player-only route that creates an `Order` row, builds the Stellar payment XDR, and returns the QR-ready quote.
- **Checkout submit API (#53):** `POST /api/v1/checkout/submit` — idempotent submit with `Idempotency-Key` header and fast-path settlement via `verifyAndAdvanceOrder`.
- **Stellar watcher (#54):** `apps/worker/src/jobs/stellar-watcher.ts` — polls Horizon for payments matching the order memo and calls the shared confirmer.
- **Payout worker (#55):** `apps/worker/src/jobs/payout.ts` — sends net amount to the studio payout wallet and writes `LedgerEntry(PAYOUT_OUT)`.
- **Webhook delivery (#56):** `apps/worker/src/jobs/webhook-delivery.ts` — signed `purchase_completed` POST with retry + exponential backoff; DLQs exhausted deliveries to the `refund` queue.
- **Refund stub (#57):** `apps/worker/src/jobs/refund.ts` — marks order `REFUNDED` and writes a `REFUND` ledger entry.
- **Order events SSE (#58):** `GET /api/v1/orders/[id]/events` — Redis pub/sub-backed SSE stream with auth check; `apps/web/lib/sse.ts` stream helper.
- **Checkout page (#59):** `/s/[slug]/checkout` — server component loads shop + item; client island renders QR code, detects Freighter, and subscribes to SSE for live status.
- **Demo e2e (#60):** Playwright acceptance test covering storefront → checkout → programmatic testnet payment → `PAID / DELIVERED` status.

## Sprint 2 — Catalogue & Storefront (#31–#47)

Catalogue ingestion (pull + push) and read-only branded storefront.

- **DTO mappers (#31):** `@xgamefi/shared/dto` — `toItemDto` (7-dp Stellar price, ISO dates, metadata fallback) and `toShopDto` (published layout/theme, omits draft layout) with barrel export.
- **Catalogue schemas (#32):** `@xgamefi/shared/zod/catalogue` — `RemoteItem`, `RemoteItemsSchema`, `ItemOverrideInput` and `ShopItemsQuery`.
- **Shared catalogue upsert (#33):** `@xgamefi/shared/catalogue/upsert` — transaction-based upsert by `studioId_externalId` plus stale-item deactivation.
- **Remote fetch guard (#34):** `@xgamefi/shared/catalogue/fetch-remote` — SSRF-safe `fetchRemoteItems(apiBaseUrl)` via `safeFetch`.
- **Catalogue-sync worker (#35):** `apps/worker/src/jobs/catalogue-sync.ts` — BullMQ processor that pulls and upserts a studio’s catalogue.
- **Inbound ingest auth (#36):** `apps/web/lib/ingest-auth.ts` — API-key hash lookup + HMAC-SHA256 verification for `/ingest/*`.
- **Ingest items API (#37):** `POST /api/v1/ingest/items` — idempotent push ingest delegating to `upsertCatalogueItems`.
- **Studio items API (#38):** `GET /studios/[id]/items`, `POST /studios/[id]/items/sync`, `PATCH /studios/[id]/items/[itemId]` — studio-scoped list, sync trigger and override.
- **Public item API (#39):** `GET /api/v1/items/[id]` — public active-item lookup.
- **Shop config API (#40):** `GET /studios/[id]/shop` (studio) and `GET /api/v1/shops/[slug]` (public) — published shop config.
- **Storefront items query (#41):** `GET /api/v1/shops/[slug]/items` — filtered, paginated public catalogue (`q`, `category`, `rarity`, `featured`).
- **Studio items dashboard (#42):** `/dashboard/items` — server component listing synced items with branded `ItemRow` cards.
- **Brand override helper (#43):** `app/(storefront)/s/[slug]/brand.ts` — converts a studio brand blob into CSS custom properties.
- **Storefront islands (#44):** `ItemCard`, `ItemModal` and `StorefrontFilters` client components.
- **Storefront grid page (#45):** `/s/[slug]` — published shop grid with filters, pagination and per-studio branding.
- **Item detail page (#46):** `/s/[slug]/item/[itemId]` — public item detail view with breadcrumb, metadata and brand overrides.
- **Phase verification (#47):** full test/typecheck/lint pass, `docs/features.md` updated, branch pushed and PR opened.

## Sprint 1 — Auth & Tenancy (#14–#30)

Authentication and multi-tenant authorization layer.

- **Shared auth primitives (#14–#18):** `@xgamefi/shared/auth` — opaque session id gen / SHA-256 hash / constant-time compare, wallet nonce + server-side Freighter (Ed25519) signature verify, CSRF helpers (same-origin check + `jose` double-submit token), rate-limit key builders + login backoff math, the canonical `Principal` type, auth Zod schemas (`@xgamefi/shared/zod/auth`) and the `MeDto` mapper (`@xgamefi/shared/dto/auth`).
- **Web auth lib (#19–#23):** `apps/web/lib/auth` — argon2id password hash/verify, Redis client + rate-limit/login-backoff, opaque cookie sessions (Redis mirror + `Session` row + sliding 30-min idle TTL), central RBAC guards (`getPrincipal`/`requirePrincipal`/`requireRole`/`requireStudio`/`scopeToStudio`), request-level CSRF Origin/Referer guard, and a secret-stripping `AuditLog` writer. Session cookies are attached to the route `Response` (testable) with reads via `next/headers`.
- **Schema (#27):** additive migration — `Session.playerId` (userId now nullable) for player sessions + auth lookup indexes.
- **Auth API (#24–#26):** `POST /api/v1/auth/login` (argon2id, rate-limit, backoff, CSRF, audit, generic `INVALID_CREDENTIALS`), `POST /auth/logout` (revoke + clear cookie), `GET /auth/me`, `POST /auth/wallet/challenge` (one-time time-boxed nonce), `POST /auth/wallet/verify` (server-side Freighter verify → player session).
- **Edge gate (#28):** `proxy.ts` coarse cookie-presence redirect for `/admin`,`/dashboard` + security headers — explicitly NOT the authoritative check (every handler re-verifies).
- **Login UI (#29):** `/login` page + terminal-style client form (BRAND styling).
- **Acceptance (#30):** executable gate — admin logs in to a cookie session; player signs a Freighter challenge to a player session.

## Sprint 0 — Foundations (#1–#13)

Stood up the xGameFi pnpm monorepo and verified, secure base every later phase builds on.

- **Workspace skeleton (#1):** pnpm 10 workspace (`apps/*`, `packages/*`), strict `tsconfig.base.json`, root `lint`/`typecheck`/`test` scripts, `@xgamefi/config` package + shared eslint preset.
- **Env schema (#2):** fail-fast Zod env schema in `@xgamefi/config/env` (`parseEnv` + frozen `env`), `.env.example` / `.env.test`. A root `vitest.setup.ts` loads the env file so suites that transitively import `env` can run.
- **Dev infra (#3):** `docker-compose.yml` — Postgres 17, Redis 7, MinIO (+ bucket bootstrap).
- **Database (#4):** full Prisma 7 schema (all SPEC §5 entities), single `PrismaClient` via the `pg` driver adapter, `prisma.config.ts` (Prisma 7 moves the datasource URL out of the schema), init migration. Generated client uses extensionless imports so Next's Turbopack resolves it.
- **Money/trust primitives (#5–#8, tests-first):** `@xgamefi/shared` `money` (Decimal fee/net, 7dp Stellar amounts), `hmac` (constant-time webhook sign/verify with replay window), `ssrf` (HTTPS-only guard rejecting metadata IP + DNS rebinding, `safeFetch`), `stellar` (`buildPaymentXdr`/`verifyPayment`/`sendPayment` against a mocked Horizon).
- **Seed (#9):** idempotent seed — admin (argon2id), Gridlock studio (BRAND colors, webhook secret hash), published shop, Sword Skin @ 1 USDT, filler items.
- **Web shell (#10):** Next 16 App Router shell, Tailwind v4 `@theme` from BRAND, Space Grotesk + JetBrains Mono fonts, Material Symbols, CSP/HSTS/X-Content-Type-Options/Referrer-Policy/X-Frame-Options headers.
- **Health/readiness (#11):** `GET /api/health` (liveness) and `GET /api/ready` (DB + Redis, 200/503).
- **Worker (#12):** BullMQ + ioredis bootstrap; `@xgamefi/shared/queues` registry of all seven SPEC §9 queues with stub processors (filled per later phase).
- **CI (#13):** GitHub Actions pipeline — lint, `tsc --noEmit`, test, Prisma migrate-diff drift check, `pnpm audit` (fails on high/critical).
