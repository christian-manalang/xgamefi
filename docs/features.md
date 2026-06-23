# Features Log

A running log of shipped features. Append one entry per change (newest first).

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
