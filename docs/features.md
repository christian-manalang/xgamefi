# Features Log

A running log of shipped features. Append one entry per change (newest first).

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
