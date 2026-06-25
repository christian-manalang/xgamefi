# xGameFi

Commerce infrastructure for game studios — a multi-tenant storefront, primary sale, and P2P marketplace settling on Stellar.

> See [`SPEC.md`](./SPEC.md) for the product spec, [`AGENT.md`](./AGENT.md) for engineering rules, [`BRAND.md`](./BRAND.md) for design tokens, and [`docs/superpowers/plans`](./docs/superpowers/plans) for phase-by-phase implementation plans.

## Architecture

A pnpm monorepo. Two runtime apps over three shared packages:

| Package | Responsibility |
| --- | --- |
| `apps/web` | Next.js 16 App Router UI + `/api` route handlers |
| `apps/worker` | BullMQ queue consumers |
| `packages/config` | Zod env schema (fail-fast at boot), eslint preset, Tailwind `@theme` |
| `packages/db` | Single Prisma 7 client (pg adapter), full schema, seed |
| `packages/shared` | Money (`Decimal`), HMAC, SSRF guard, Stellar helpers, queue registry |

All money/trust-boundary logic (fee math, payment verification, HMAC, SSRF) lives in `packages/shared` and is written tests-first.

## Pages

| Route | Description |
| --- | --- |
| `/` | Landing page |
| `/login` | Authentication |
| `/admin` | Admin dashboard |
| `/admin/users` | User management |
| `/admin/studios` | Studio management |
| `/admin/studios/:id` | Studio detail |
| `/admin/settings` | Admin settings |
| `/admin/transactions` | Transaction management |
| `/dashboard/items` | Studio items |
| `/dashboard/promotions` | Studio promotions |
| `/dashboard/referrals` | Studio referrals |
| `/dashboard/builder` | Shop builder |
| `/s/:slug` | Storefront home |
| `/s/:slug/checkout` | Checkout |
| `/s/:slug/referrals` | Storefront referrals |
| `/s/:slug/market` | P2P marketplace |
| `/s/:slug/market/listing/:id` | Listing detail |
| `/s/:slug/item/:itemId` | Item detail |

## Requirements

- Node.js 22 LTS (`.nvmrc`) · pnpm 10.x · Docker (for local Postgres 17 / Redis 7 / MinIO)

## Getting started

### Full stack in Docker

```bash
pnpm install
cp .env.example .env          # then fill in values
docker compose up -d --build  # Postgres 17, Redis 7, MinIO + web (:3000) + worker + migrate/seed
```

The `web` container runs Next.js in dev mode. Migrations and seed run automatically before the app starts.

### Local pnpm workflow

```bash
pnpm install
cp .env.example .env          # then fill in values
docker compose up -d          # Postgres 17, Redis 7, MinIO only
pnpm db:generate
pnpm --filter @xgamefi/db exec prisma migrate deploy
pnpm db:seed                  # admin + Gridlock studio + published shop + Sword Skin @ 1 USDT

pnpm --filter @xgamefi/web dev      # web on :3000
pnpm --filter @xgamefi/worker dev   # queue workers
```

Health: `GET /api/health` (liveness), `GET /api/ready` (DB + Redis).

## Checks

```bash
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit across packages
pnpm test        # vitest
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, Prisma drift check, and `pnpm audit` (fails on high/critical). See [`docs/migrations.md`](./docs/migrations.md) for DB conventions and [`docs/features.md`](./docs/features.md) for the feature log.
