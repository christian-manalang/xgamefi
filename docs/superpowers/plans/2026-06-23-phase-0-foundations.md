# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the xGameFi pnpm monorepo skeleton — shared config/env, full Prisma 7 schema + seed, tested money/HMAC/SSRF/Stellar primitives, a Next 16 web shell, a BullMQ worker bootstrap, dev infra, and CI — so every later phase builds on a verified, secure base.

**Architecture:** Two runtime apps (`apps/web` = Next.js 16 App Router UI + `/api/v1` route handlers; `apps/worker` = BullMQ consumers) sit over three shared packages (`@xgamefi/config`, `@xgamefi/db`, `@xgamefi/shared`). All money-critical and trust-boundary logic (Stellar verify, fee math, HMAC, SSRF guard) lives in `@xgamefi/shared` and is written tests-first. `@xgamefi/db` owns the single Prisma client (pg driver adapter) and the seed; `@xgamefi/config` owns shared presets and the Zod env schema parsed fail-fast at boot.

**Tech Stack:** Node 22 LTS, pnpm 10.x workspaces, next 16.2.x + react 19.2.x, typescript 5.x (`strict`), prisma 7.x (≥7.8, ESM-only) + @prisma/client + pg + @prisma/adapter-pg, PostgreSQL 17, tailwindcss 4.3.x + @tailwindcss/postcss, @stellar/stellar-sdk 15.1.x, @stellar/freighter-api 5.x, bignumber.js, bullmq + ioredis (Redis 7.x), @aws-sdk/client-s3 + s3-request-presigner, argon2 (argon2id), jose, zod, qrcode, eslint (eslint-config-next) + prettier, vitest + @playwright/test.

## Global Constraints

These are project-wide rules from `AGENT.md`. **Every task implicitly inherits all of them.**

- Node.js **22 LTS** (≥20.9 required); package manager **pnpm 10.x**; commit `pnpm-lock.yaml`.
- Pin majors, float patches (`^`): **next 16.2.x**, **react/react-dom 19.2.x**, **typescript 5.x** (`strict: true`), **prisma + @prisma/client 7.x (≥7.8, ESM-only, Rust-free)**, **PostgreSQL 17**, **tailwindcss + @tailwindcss/postcss 4.3.x**, **@stellar/stellar-sdk 15.1.x**, **@stellar/freighter-api 5.x**, **Redis 7.x**.
- Never introduce an abandoned or pre-release dependency version.
- **Money is `Decimal`, never `float`.** Use `bignumber.js` / `Prisma.Decimal`; Stellar amounts have 7 decimals (stroops). Never use JS `number` for amounts.
- **Validate every input with Zod; return mapped DTOs**, never raw Prisma rows or stack traces.
- **Secrets live in env / Railway variables** — never in the repo, the DB in plaintext, or client bundles. No secrets in `NEXT_PUBLIC_*`.
- **Parse and validate env at boot with Zod; fail fast** on missing/invalid values. Provide a matching `.env.test`.
- **SSRF guard on every studio-supplied URL** (`apiBaseUrl`, `webhookUrl`) — HTTPS-only; reject private/loopback/link-local/cloud-metadata ranges; pin resolved IP against DNS rebinding; strict timeout + response-size cap; no cross-host redirects. No raw `fetch`/POST to a studio URL anywhere.
- **Never trust the client for money or authorization.** Verify every payment on-chain server-side; re-check roles/ownership in every handler (defense in depth — do not rely on `proxy.ts` alone).
- **Everything is idempotent** where retries or webhooks are involved.
- Single `PrismaClient` instance via the **pg driver adapter**; configure Prisma via **`prisma.config.ts`** (load env yourself); `migrate`/`db push` no longer auto-generate or auto-seed — run `prisma generate` and `db:seed` explicitly.
- Tailwind v4 is **CSS-first**: `@import "tailwindcss";` + `@theme` block from `BRAND.md`. There is **no `tailwind.config.js`**.
- **Dark theme only.** Hero accent is `primary-fixed` (`#c3f400`, acid lime) on obsidian `#131313`, used sparingly. Gate scanlines/glitch/marquee/pulse behind `prefers-reduced-motion: reduce`.
- CI gate (green or no merge): `pnpm lint`, `tsc --noEmit`, `pnpm test`, `prisma migrate diff` drift check, `pnpm audit` (fail on high/critical).

---

## File Structure

Each file's single responsibility:

```
xgamefi/
├─ package.json                              # root: pnpm workspace scripts, devDeps, packageManager pin
├─ pnpm-workspace.yaml                       # workspace globs: apps/*, packages/*
├─ tsconfig.base.json                        # shared strict TS compiler options (extended by every package)
├─ .npmrc                                    # pnpm settings (strict-peer, node-linker)
├─ .nvmrc                                    # Node 22 pin
├─ .gitignore                               # node_modules, .env, .next, dist, generated client
├─ .env.example                              # every env var per AGENT.md §12, no secrets
├─ .env.test                                 # test values for env at boot
├─ docker-compose.yml                        # dev infra: Postgres 17, Redis 7, MinIO + createbuckets
├─ vitest.workspace.ts                       # aggregates package vitest configs
├─ .github/workflows/ci.yml                  # lint, tsc, test, prisma drift, audit
├─ packages/
│  ├─ config/
│  │  ├─ package.json                        # @xgamefi/config exports (env, eslint, tsconfig, tailwind)
│  │  ├─ tsconfig.json                       # extends tsconfig.base
│  │  ├─ src/env.ts                          # Zod env schema, parsed at import, fail-fast → `env`
│  │  ├─ src/env.test.ts                     # env parse/fail-fast unit tests
│  │  ├─ eslint-preset.mjs                   # shared eslint flat config preset
│  │  └─ tailwind-theme.css                  # @theme tokens from BRAND.md (imported by web globals)
│  ├─ db/
│  │  ├─ package.json                        # @xgamefi/db, db:seed/generate/migrate scripts
│  │  ├─ tsconfig.json
│  │  ├─ prisma/schema.prisma                # FULL schema for all SPEC §5 entities
│  │  ├─ prisma.config.ts                    # loads env, points at schema, declares seed
│  │  ├─ src/client.ts                       # single PrismaClient via pg adapter; re-exports Prisma
│  │  ├─ src/index.ts                        # `export { prisma, Prisma }`
│  │  └─ prisma/seed.ts                       # admin + Gridlock + shop + Sword Skin + filler items
│  └─ shared/
│     ├─ package.json                        # @xgamefi/shared, subpath exports
│     ├─ tsconfig.json
│     ├─ vitest.config.ts
│     ├─ src/money.ts                         # feeAmount/netAmount/toStellarAmount/fromStellarAmount
│     ├─ src/money.test.ts
│     ├─ src/hmac.ts                          # signWebhook/verifyHmac
│     ├─ src/hmac.test.ts
│     ├─ src/ssrf.ts                          # assertPublicUrl/safeFetch
│     ├─ src/ssrf.test.ts
│     ├─ src/stellar.ts                       # Asset/buildPaymentXdr/verifyPayment/sendPayment
│     ├─ src/stellar.test.ts
│     └─ src/queues.ts                        # queue names + getQueue/registerWorker registry stubs
├─ apps/
│  ├─ web/
│  │  ├─ package.json                        # @xgamefi/web (next dev/build/start)
│  │  ├─ tsconfig.json
│  │  ├─ next.config.ts                      # security headers (CSP/HSTS/etc.)
│  │  ├─ postcss.config.mjs                  # @tailwindcss/postcss
│  │  ├─ app/globals.css                      # @import tailwindcss + @theme + base body styles
│  │  ├─ app/fonts.ts                         # next/font Space Grotesk + JetBrains Mono
│  │  ├─ app/layout.tsx                       # root layout: fonts, Material Symbols, html/body
│  │  ├─ app/page.tsx                         # placeholder landing
│  │  ├─ app/api/health/route.ts             # liveness
│  │  ├─ app/api/ready/route.ts              # readiness (DB + Redis)
│  │  └─ app/api/health/route.test.ts        # health/ready handler tests
│  └─ worker/
│     ├─ package.json                        # @xgamefi/worker (dev/start)
│     ├─ tsconfig.json
│     ├─ src/redis.ts                         # ioredis connection from env
│     ├─ src/index.ts                         # bootstrap: register all queue stubs, log ready
│     └─ src/index.test.ts                    # registry wiring test
```

---

### Task 1: Workspace skeleton + root tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`, `.nvmrc`, `.gitignore`, `vitest.workspace.ts`
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/eslint-preset.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace resolution for `@xgamefi/*`; `tsconfig.base.json` (strict options) extended by every package; root scripts `pnpm lint`, `pnpm test`, `pnpm typecheck`.

- [ ] **Step 1: Create the workspace manifest and root files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.nvmrc`:
```
22
```

`.npmrc`:
```
node-linker=isolated
strict-peer-dependencies=false
auto-install-peers=true
```

`.gitignore`:
```
node_modules/
.next/
dist/
*.tsbuildinfo
.env
.env.local
packages/db/src/generated/
coverage/
```

`package.json` (root):
```json
{
  "name": "xgamefi",
  "private": true,
  "packageManager": "pnpm@10.12.1",
  "engines": { "node": ">=22" },
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "typecheck": "pnpm -r exec tsc --noEmit",
    "test": "vitest run",
    "db:seed": "pnpm --filter @xgamefi/db db:seed",
    "db:generate": "pnpm --filter @xgamefi/db db:generate",
    "db:migrate": "pnpm --filter @xgamefi/db db:migrate"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "eslint": "^9.15.0",
    "prettier": "^3.4.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.workspace.ts`:
```ts
export default ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"];
```

- [ ] **Step 2: Create the config package manifest, tsconfig, and eslint preset**

`packages/config/package.json`:
```json
{
  "name": "@xgamefi/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./env": "./src/env.ts",
    "./eslint": "./eslint-preset.mjs",
    "./tailwind": "./tailwind-theme.css"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

`packages/config/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "noEmit": true },
  "include": ["src", "*.mjs"]
}
```

`packages/config/eslint-preset.mjs`:
```js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: "Use @xgamefi/shared/ssrf safeFetch for studio URLs." }],
    },
  },
  { ignores: ["**/dist/**", "**/.next/**", "**/generated/**", "**/node_modules/**"] },
];
```

- [ ] **Step 3: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: install completes; `pnpm-lock.yaml` written; `packages/config` linked as `@xgamefi/config`.

Run: `pnpm -r exec node -e "console.log('ok')"`
Expected: prints `ok` for each package (only config so far).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .npmrc .nvmrc .gitignore vitest.workspace.ts pnpm-lock.yaml packages/config/package.json packages/config/tsconfig.json packages/config/eslint-preset.mjs
git commit -m "chore: scaffold pnpm monorepo workspace and shared config package"
```

---

### Task 2: Zod env schema in @xgamefi/config (boot validation, fail-fast)

**Files:**
- Create: `packages/config/src/env.ts`
- Test: `packages/config/src/env.test.ts`
- Create: `packages/config/vitest.config.ts`
- Create: `.env.example`, `.env.test`

**Interfaces:**
- Consumes: nothing.
- Produces: `import { env } from "@xgamefi/config/env"` — a validated, frozen object; **throws at import if invalid**. Keys exactly per `AGENT.md` §12.

- [ ] **Step 1: Write the failing test**

`packages/config/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

`packages/config/src/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const valid = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(32),
  DATABASE_URL: "postgresql://user:pass@localhost:5432/xgamefi",
  SHADOW_DATABASE_URL: "postgresql://user:pass@localhost:5432/xgamefi_shadow",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "xgamefi",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "change-me-strong",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  STELLAR_RECEIVING_ACCOUNT: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  STELLAR_PAYOUT_SIGNER_SECRET: "SAEXAMPLE",
  STELLAR_USD_ASSET_CODE: "USDT",
  STELLAR_USD_ASSET_ISSUER: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  PLATFORM_FEE_BPS: "500",
  WEBHOOK_MAX_ATTEMPTS: "5",
  WEBHOOK_TIMESTAMP_TOLERANCE_SEC: "300",
};

describe("parseEnv", () => {
  it("parses a valid env and coerces numbers/booleans", () => {
    const e = parseEnv(valid);
    expect(e.PLATFORM_FEE_BPS).toBe(500);
    expect(e.WEBHOOK_MAX_ATTEMPTS).toBe(5);
    expect(e.S3_FORCE_PATH_STYLE).toBe(true);
    expect(e.STELLAR_NETWORK).toBe("testnet");
  });

  it("throws on a missing required var", () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when SESSION_SECRET is shorter than 32 chars", () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "tooshort" })).toThrow(/SESSION_SECRET/);
  });

  it("throws on an invalid STELLAR_NETWORK enum value", () => {
    expect(() => parseEnv({ ...valid, STELLAR_NETWORK: "mainnet" })).toThrow(/STELLAR_NETWORK/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/config exec vitest run src/env.test.ts`
Expected: FAIL — `Failed to resolve import "./env"` / `parseEnv is not exported`.

- [ ] **Step 3: Write minimal implementation**

`packages/config/src/env.ts`:
```ts
import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  DATABASE_URL: z.string().url(),
  SHADOW_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: boolFromString.default("true"),

  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),

  STELLAR_NETWORK: z.enum(["testnet", "pubnet"]),
  STELLAR_HORIZON_URL: z.string().url(),
  STELLAR_RPC_URL: z.string().url(),
  STELLAR_RECEIVING_ACCOUNT: z.string().regex(/^G[A-Z2-7]{55}$/, "must be a Stellar G... public key"),
  STELLAR_PAYOUT_SIGNER_SECRET: z.string().min(1),
  STELLAR_USD_ASSET_CODE: z.string().min(1).max(12),
  STELLAR_USD_ASSET_ISSUER: z.string().regex(/^G[A-Z2-7]{55}$/, "must be a Stellar G... public key"),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000),

  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  WEBHOOK_TIMESTAMP_TOLERANCE_SEC: z.coerce.number().int().min(1).default(300),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return Object.freeze(result.data);
}

export const env: Env = parseEnv(process.env);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/config exec vitest run src/env.test.ts`
Expected: PASS — 4 tests. (The test imports `parseEnv` only; the top-level `env` export is exercised at app boot, not in unit tests.)

- [ ] **Step 5: Create `.env.example` and `.env.test`**

`.env.example` (every var per AGENT.md §12, no real secrets):
```dotenv
# Core
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=change-me-32-bytes-min-0000000000

# Database (Railway Postgres)
DATABASE_URL=postgresql://user:pass@localhost:5432/xgamefi
SHADOW_DATABASE_URL=postgresql://user:pass@localhost:5432/xgamefi_shadow

# Redis (Railway)
REDIS_URL=redis://localhost:6379

# Object storage (MinIO / S3)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=xgamefi
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

# Seeded admin (bootstrap only)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-strong

# Stellar
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_RECEIVING_ACCOUNT=GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H
STELLAR_PAYOUT_SIGNER_SECRET=SCHANGE_ME_NEVER_COMMIT_REAL_SECRET
STELLAR_USD_ASSET_CODE=USDT
STELLAR_USD_ASSET_ISSUER=GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H
PLATFORM_FEE_BPS=500

# Webhooks
WEBHOOK_MAX_ATTEMPTS=5
WEBHOOK_TIMESTAMP_TOLERANCE_SEC=300
```

`.env.test` (used by CI and integration tests; points at compose services):
```dotenv
NODE_ENV=test
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=test-session-secret-0000000000000000
DATABASE_URL=postgresql://user:pass@localhost:5432/xgamefi
SHADOW_DATABASE_URL=postgresql://user:pass@localhost:5432/xgamefi_shadow
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=xgamefi
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=test-admin-password
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_RECEIVING_ACCOUNT=GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H
STELLAR_PAYOUT_SIGNER_SECRET=SCHANGE_ME_TEST_ONLY
STELLAR_USD_ASSET_CODE=USDT
STELLAR_USD_ASSET_ISSUER=GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H
PLATFORM_FEE_BPS=500
WEBHOOK_MAX_ATTEMPTS=5
WEBHOOK_TIMESTAMP_TOLERANCE_SEC=300
```

Run: `pnpm --filter @xgamefi/config exec vitest run`
Expected: PASS — all env tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/env.ts packages/config/src/env.test.ts packages/config/vitest.config.ts .env.example .env.test
git commit -m "feat(config): add fail-fast Zod env schema with boot validation"
```

---

### Task 3: docker-compose dev services (Postgres 17, Redis 7, MinIO)

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: local Postgres on `5432`, Redis on `6379`, MinIO on `9000`/`9001`, bucket `xgamefi` created — backing `DATABASE_URL`/`REDIS_URL`/`S3_*` from `.env.example`.

- [ ] **Step 1: Write the compose file**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: xgamefi
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d xgamefi"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio:/data

  createbuckets:
    image: minio/mc
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "until (mc alias set local http://minio:9000 minioadmin minioadmin) do sleep 1; done;
      mc mb -p local/xgamefi; mc anonymous set download local/xgamefi; exit 0;"

volumes:
  pgdata: {}
  minio: {}
```

> Note: a `xgamefi_shadow` database (for `SHADOW_DATABASE_URL` / Prisma drift) is created on demand in CI and dev via `createdb`; the compose default DB is `xgamefi`.

- [ ] **Step 2: Bring services up and verify they are healthy**

Run: `docker compose up -d`
Expected: `postgres`, `redis`, `minio`, `createbuckets` start.

Run: `docker compose ps`
Expected: `postgres` and `redis` show `healthy`; `createbuckets` exits `0`.

- [ ] **Step 3: Verify Postgres, Redis, and the bucket are reachable**

Run: `docker compose exec -T postgres pg_isready -U user -d xgamefi`
Expected: `... accepting connections`.

Run: `docker compose exec -T redis redis-cli ping`
Expected: `PONG`.

Run: `docker compose exec -T minio mc ls local/ 2>/dev/null || docker run --rm --network host minio/mc sh -c "mc alias set l http://localhost:9000 minioadmin minioadmin && mc ls l"`
Expected: lists the `xgamefi` bucket.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose dev services (postgres17, redis7, minio)"
```

---

### Task 4: packages/db — full Prisma 7 schema + pg adapter + client singleton

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/prisma.config.ts`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`, `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `env` (`DATABASE_URL`) from `@xgamefi/config/env`.
- Produces: `import { prisma } from "@xgamefi/db"` (single `PrismaClient`, pg adapter) and `import { Prisma } from "@xgamefi/db"` (for `Prisma.Decimal` + generated enums). All money columns `Decimal`; all ids `uuid`.

- [ ] **Step 1: Create the db package manifest, tsconfig, and prisma.config.ts**

`packages/db/package.json`:
```json
{
  "name": "@xgamefi/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "db:diff": "prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url $SHADOW_DATABASE_URL --exit-code"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "@prisma/adapter-pg": "^7.8.0",
    "pg": "^8.13.0",
    "@xgamefi/config": "workspace:*"
  },
  "devDependencies": {
    "prisma": "^7.8.0",
    "tsx": "^4.19.0",
    "argon2": "^0.41.0",
    "@types/pg": "^8.11.0"
  }
}
```

`packages/db/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "prisma", "prisma.config.ts"]
}
```

`packages/db/prisma.config.ts` (Prisma 7: env is NOT auto-loaded — load it yourself):
```ts
import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { seed: "tsx prisma/seed.ts" },
});
```
> Add `dotenv` to `devDependencies` (`"dotenv": "^16.4.0"`) so `prisma.config.ts` loads `.env` itself.

- [ ] **Step 2: Write the full Prisma 7 schema (all SPEC §5 entities)**

`packages/db/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated"
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  STUDIO_OWNER
  STUDIO_MEMBER
}

enum IntegrationMode {
  API_PULL
  WEBHOOK_PUSH
}

enum StudioStatus {
  PENDING
  ACTIVE
  SUSPENDED
}

enum Currency {
  XLM
  USDT
}

enum ShopStatus {
  DRAFT
  PUBLISHED
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
}

enum OwnershipSource {
  PRIMARY
  P2P
}

enum P2PListingStatus {
  ACTIVE
  LOCKED
  SOLD
  CANCELLED
}

enum P2PTradeStatus {
  ESCROW_PENDING
  PAID
  ITEM_TRANSFERRED
  COMPLETED
  REFUNDED
  FAILED
}

enum LedgerEntryType {
  SALE_IN
  PAYOUT_OUT
  P2P_ESCROW_IN
  P2P_PAYOUT
  REFERRAL_REWARD
  REFUND
}

enum ReferralStatus {
  PENDING
  QUALIFIED
  REWARDED
  EXPIRED
}

enum PromotionType {
  PERCENT
  FIXED
  BUNDLE
  FIRST_PURCHASE
}

enum WebhookEvent {
  purchase_completed
  purchase_pending
  purchase_failed
  p2p_trade_completed
}

enum WebhookDeliveryStatus {
  PENDING
  DELIVERED
  FAILED
  EXHAUSTED
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  username     String   @unique
  passwordHash String
  role         Role
  studioId     String?  @db.Uuid
  studio       Studio?  @relation(fields: [studioId], references: [id])
  isActive     Boolean  @default(true)
  lastLoginAt  DateTime?
  sessions     Session[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Session {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation(fields: [userId], references: [id])
  tokenHash String    @unique
  userAgent String?
  ip        String?
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
}

model Player {
  id                  String   @id @default(uuid()) @db.Uuid
  walletAddress       String   @unique
  handle              String?
  referredByPlayerId  String?  @db.Uuid
  referredByPlayer    Player?  @relation("PlayerReferrals", fields: [referredByPlayerId], references: [id])
  referredPlayers     Player[] @relation("PlayerReferrals")
  firstPurchaseAt     DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model AuthChallenge {
  id            String   @id @default(uuid()) @db.Uuid
  walletAddress String
  nonce         String
  expiresAt     DateTime
  usedAt        DateTime?
  createdAt     DateTime @default(now())

  @@index([walletAddress])
}

model Studio {
  id                   String          @id @default(uuid()) @db.Uuid
  name                 String
  slug                 String          @unique
  description          String?
  logoUrl              String?
  brand                Json?
  payoutWalletAddress  String?
  integrationMode      IntegrationMode @default(API_PULL)
  apiBaseUrl           String?
  webhookUrl           String?
  webhookSecretHash    String?
  platformFeeBps       Int
  status               StudioStatus    @default(PENDING)
  users                User[]
  apiKeys              ApiKey[]
  items                Item[]
  shop                 Shop?
  orders               Order[]
  promotions           Promotion[]
  webhookDeliveries    WebhookDelivery[]
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
}

model ApiKey {
  id         String    @id @default(uuid()) @db.Uuid
  studioId   String    @db.Uuid
  studio     Studio    @relation(fields: [studioId], references: [id])
  keyPrefix  String
  hashedKey  String
  scopes     String[]
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  @@index([studioId])
}

model Item {
  id            String   @id @default(uuid()) @db.Uuid
  studioId      String   @db.Uuid
  studio        Studio   @relation(fields: [studioId], references: [id])
  externalId    String
  name          String
  description   String?
  imageUrl      String?
  priceAmount   Decimal  @db.Decimal(38, 7)
  priceCurrency Currency
  stock         Int?
  rarity        String?
  category      String?
  metadata      Json?
  isActive      Boolean  @default(true)
  syncedAt      DateTime?
  orders        Order[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([studioId, externalId])
  @@index([studioId])
}

model Shop {
  id              String     @id @default(uuid()) @db.Uuid
  studioId        String     @unique @db.Uuid
  studio          Studio     @relation(fields: [studioId], references: [id])
  status          ShopStatus @default(DRAFT)
  layout          Json?
  draftLayout     Json?
  theme           Json?
  featuredItemIds String[]
  publishedAt     DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

model Order {
  id                  String         @id @default(uuid()) @db.Uuid
  studioId            String         @db.Uuid
  studio              Studio         @relation(fields: [studioId], references: [id])
  itemId              String         @db.Uuid
  item                Item           @relation(fields: [itemId], references: [id])
  playerId            String         @db.Uuid
  player              Player         @relation(fields: [playerId], references: [id])
  quantity            Int
  currency            Currency
  grossAmount         Decimal        @db.Decimal(38, 7)
  discountAmount      Decimal        @default(0) @db.Decimal(38, 7)
  platformFeeAmount   Decimal        @db.Decimal(38, 7)
  netToStudioAmount   Decimal        @db.Decimal(38, 7)
  promotionId         String?        @db.Uuid
  referralCodeUsed    String?
  idempotencyKey      String         @unique
  stellarTxHash       String?        @unique
  paymentStatus       PaymentStatus  @default(PENDING)
  deliveryStatus      DeliveryStatus @default(PENDING)
  paidAt              DateTime?
  deliveredAt         DateTime?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  @@index([studioId])
  @@index([playerId])
}

model ItemOwnership {
  id                 String          @id @default(uuid()) @db.Uuid
  playerId           String          @db.Uuid
  player             Player          @relation(fields: [playerId], references: [id])
  itemId             String          @db.Uuid
  studioId           String          @db.Uuid
  quantity           Int
  source             OwnershipSource
  lockedForListingId String?         @db.Uuid
  acquiredAt         DateTime        @default(now())

  @@index([playerId])
  @@index([studioId])
}

model P2PListing {
  id             String           @id @default(uuid()) @db.Uuid
  studioId       String           @db.Uuid
  itemId         String           @db.Uuid
  sellerPlayerId String           @db.Uuid
  seller         Player           @relation(fields: [sellerPlayerId], references: [id])
  price          Decimal          @db.Decimal(38, 7)
  currency       Currency
  status         P2PListingStatus @default(ACTIVE)
  lockedAt       DateTime?
  trades         P2PTrade[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([studioId])
}

model P2PTrade {
  id                String         @id @default(uuid()) @db.Uuid
  listingId         String         @db.Uuid
  listing           P2PListing     @relation(fields: [listingId], references: [id])
  buyerPlayerId     String         @db.Uuid
  sellerPlayerId    String         @db.Uuid
  price             Decimal        @db.Decimal(38, 7)
  currency          Currency
  platformFeeAmount Decimal        @db.Decimal(38, 7)
  netToSellerAmount Decimal        @db.Decimal(38, 7)
  escrowTxHash      String?
  payoutTxHash      String?
  status            P2PTradeStatus @default(ESCROW_PENDING)
  idempotencyKey    String         @unique
  createdAt         DateTime       @default(now())
  completedAt       DateTime?
}

model LedgerEntry {
  id            String          @id @default(uuid()) @db.Uuid
  type          LedgerEntryType
  orderId       String?         @db.Uuid
  tradeId       String?         @db.Uuid
  referralId    String?         @db.Uuid
  stellarTxHash String
  sourceAddress String
  destAddress   String
  amount        Decimal         @db.Decimal(38, 7)
  assetCode     String
  assetIssuer   String?
  status        String
  createdAt     DateTime        @default(now())

  @@index([orderId])
  @@index([tradeId])
}

model Referral {
  id                String         @id @default(uuid()) @db.Uuid
  code              String         @unique
  referrerPlayerId  String         @db.Uuid
  studioId          String?        @db.Uuid
  refereePlayerId   String?        @db.Uuid
  status            ReferralStatus @default(PENDING)
  qualifyingOrderId String?        @db.Uuid
  rewardAmount      Decimal?       @db.Decimal(38, 7)
  rewardCurrency    Currency?
  rewardTxHash      String?
  createdAt         DateTime       @default(now())
  qualifiedAt       DateTime?
  rewardedAt        DateTime?

  @@index([referrerPlayerId])
}

model Promotion {
  id               String        @id @default(uuid()) @db.Uuid
  studioId         String        @db.Uuid
  studio           Studio        @relation(fields: [studioId], references: [id])
  name             String
  type             PromotionType
  value            Decimal       @db.Decimal(38, 7)
  currency         Currency?
  appliesToItemIds String[]
  bundleConfig     Json?
  startsAt         DateTime?
  endsAt           DateTime?
  usageLimit       Int?
  usageCount       Int           @default(0)
  isActive         Boolean       @default(true)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([studioId])
}

model WebhookDelivery {
  id             String                @id @default(uuid()) @db.Uuid
  studioId       String                @db.Uuid
  studio         Studio                @relation(fields: [studioId], references: [id])
  event          WebhookEvent
  orderId        String?               @db.Uuid
  tradeId        String?               @db.Uuid
  url            String
  payload        Json
  signature      String
  attempt        Int                   @default(0)
  maxAttempts    Int
  status         WebhookDeliveryStatus @default(PENDING)
  responseStatus Int?
  nextAttemptAt  DateTime?
  createdAt      DateTime              @default(now())
  deliveredAt    DateTime?

  @@index([studioId])
}

model IdempotencyKey {
  id               String   @id @default(uuid()) @db.Uuid
  key              String   @unique
  scope            String
  requestHash      String
  responseSnapshot Json?
  createdAt        DateTime @default(now())
}

model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  actorType   String
  actorUserId String?  @db.Uuid
  action      String
  entityType  String
  entityId    String
  metadata    Json?
  ip          String?
  createdAt   DateTime @default(now())

  @@index([entityType, entityId])
}
```

> `WebhookEvent` enum uses `_` (e.g. `purchase_completed`) because Prisma enum members cannot contain `.`; DTO/wire mapping to the dotted `purchase.completed` form happens in `@xgamefi/shared` in Phase 3.

- [ ] **Step 3: Generate the client and verify the schema is valid**

Run: `pnpm install`
Expected: `@prisma/client`, `prisma`, `pg`, `@prisma/adapter-pg`, `tsx`, `argon2`, `dotenv` resolve.

Run: `pnpm --filter @xgamefi/db exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`.

Run: `pnpm --filter @xgamefi/db exec prisma generate`
Expected: client generated into `packages/db/src/generated`.

- [ ] **Step 4: Write the client singleton and index**

`packages/db/src/client.ts`:
```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@xgamefi/config/env";
import { PrismaClient } from "./generated/client.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

`packages/db/src/index.ts`:
```ts
export { prisma } from "./client.js";
export { Prisma } from "./generated/client.js";
```

- [ ] **Step 5: Apply the initial migration and verify the client connects**

Run: `docker compose up -d postgres`
Then: `pnpm --filter @xgamefi/db exec prisma migrate dev --name init`
Expected: migration `..._init` created and applied; tables created.

Run: `pnpm --filter @xgamefi/db exec tsx -e "import { prisma } from './src/index.ts'; console.log(await prisma.user.count());"`
Expected: prints `0` (connects, no rows yet).

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): add full Prisma 7 schema, pg adapter, client singleton, init migration"
```

---

### Task 5: @xgamefi/shared money utils (TDD)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/money.ts`
- Test: `packages/shared/src/money.test.ts`

**Interfaces:**
- Consumes: `Prisma.Decimal` from `@xgamefi/db`.
- Produces (`@xgamefi/shared/money`):
  ```ts
  function feeAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal      // deterministic, rounded down to 7dp
  function netAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal      // gross - feeAmount
  function toStellarAmount(v: Prisma.Decimal): string                          // "1.0000000" (exactly 7dp)
  function fromStellarAmount(s: string): Prisma.Decimal
  ```

- [ ] **Step 1: Create the shared package manifest, tsconfig, and vitest config**

`packages/shared/package.json`:
```json
{
  "name": "@xgamefi/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./money": "./src/money.ts",
    "./hmac": "./src/hmac.ts",
    "./ssrf": "./src/ssrf.ts",
    "./stellar": "./src/stellar.ts",
    "./queues": "./src/queues.ts"
  },
  "dependencies": {
    "@xgamefi/db": "workspace:*",
    "@xgamefi/config": "workspace:*",
    "bignumber.js": "^9.1.2",
    "@stellar/stellar-sdk": "^15.1.0",
    "bullmq": "^5.34.0",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "noEmit": true },
  "include": ["src"]
}
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 2: Write the failing test**

`packages/shared/src/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { feeAmount, netAmount, toStellarAmount, fromStellarAmount } from "./money";

const D = (v: string) => new Prisma.Decimal(v);

describe("money", () => {
  it("feeAmount applies bps and rounds DOWN to 7dp", () => {
    // 1.0000000 * 500/10000 = 0.05
    expect(feeAmount(D("1"), 500).toString()).toBe("0.05");
    // 0.0000001 * 500/10000 = 0.000000005 -> rounds down to 0
    expect(feeAmount(D("0.0000001"), 500).toString()).toBe("0");
  });

  it("netAmount is gross minus fee", () => {
    expect(netAmount(D("1"), 500).toString()).toBe("0.95");
    expect(netAmount(D("10"), 250).toString()).toBe("9.75");
  });

  it("feeAmount handles 0 and 10000 bps boundaries", () => {
    expect(feeAmount(D("5"), 0).toString()).toBe("0");
    expect(feeAmount(D("5"), 10000).toString()).toBe("5");
  });

  it("toStellarAmount always formats to exactly 7 decimals", () => {
    expect(toStellarAmount(D("1"))).toBe("1.0000000");
    expect(toStellarAmount(D("0.95"))).toBe("0.9500000");
    expect(toStellarAmount(D("12.3456789"))).toBe("12.3456789");
  });

  it("fromStellarAmount round-trips", () => {
    expect(fromStellarAmount("1.0000000").equals(D("1"))).toBe(true);
    expect(toStellarAmount(fromStellarAmount("0.9500000"))).toBe("0.9500000");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/money.test.ts`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 4: Write minimal implementation**

`packages/shared/src/money.ts`:
```ts
import BigNumber from "bignumber.js";
import { Prisma } from "@xgamefi/db";

// Stellar uses 7 decimal places (stroops). Round half-down deterministically.
const STELLAR_DP = 7;

function toBig(v: Prisma.Decimal): BigNumber {
  return new BigNumber(v.toString());
}

export function feeAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal {
  const fee = toBig(gross)
    .multipliedBy(bps)
    .dividedBy(10000)
    .decimalPlaces(STELLAR_DP, BigNumber.ROUND_DOWN);
  return new Prisma.Decimal(fee.toFixed());
}

export function netAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal {
  const net = toBig(gross).minus(toBig(feeAmount(gross, bps)));
  return new Prisma.Decimal(net.decimalPlaces(STELLAR_DP, BigNumber.ROUND_DOWN).toFixed());
}

export function toStellarAmount(v: Prisma.Decimal): string {
  return toBig(v).toFixed(STELLAR_DP);
}

export function fromStellarAmount(s: string): Prisma.Decimal {
  return new Prisma.Decimal(s);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/money.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/package.json packages/shared/tsconfig.json packages/shared/vitest.config.ts packages/shared/src/money.ts packages/shared/src/money.test.ts pnpm-lock.yaml
git commit -m "feat(shared): add decimal money utils (fee/net/stellar amount) with tests"
```

---

### Task 6: @xgamefi/shared HMAC sign/verify (TDD)

**Files:**
- Create: `packages/shared/src/hmac.ts`
- Test: `packages/shared/src/hmac.test.ts`

**Interfaces:**
- Consumes: nothing (Node `crypto`).
- Produces (`@xgamefi/shared/hmac`):
  ```ts
  function signWebhook(secret: string, timestampSec: number, rawBody: string): string  // returns "t=<unix>,v1=<hex>"
  function verifyHmac(args: { secret: string; header: string; rawBody: string; toleranceSec: number }): boolean  // constant-time, rejects skew > toleranceSec
  ```

- [ ] **Step 1: Write the failing test**

`packages/shared/src/hmac.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signWebhook, verifyHmac } from "./hmac";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ event: "purchase.completed", id: "evt_1" });

describe("hmac", () => {
  it("signWebhook produces the t=<unix>,v1=<hex> format", () => {
    const header = signWebhook(SECRET, 1_700_000_000, BODY);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
  });

  it("verifyHmac accepts a freshly signed header within tolerance", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signWebhook(SECRET, now, BODY);
    expect(verifyHmac({ secret: SECRET, header, rawBody: BODY, toleranceSec: 300 })).toBe(true);
  });

  it("verifyHmac rejects a tampered body", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signWebhook(SECRET, now, BODY);
    expect(verifyHmac({ secret: SECRET, header, rawBody: BODY + "x", toleranceSec: 300 })).toBe(false);
  });

  it("verifyHmac rejects a wrong secret", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signWebhook(SECRET, now, BODY);
    expect(verifyHmac({ secret: "other", header, rawBody: BODY, toleranceSec: 300 })).toBe(false);
  });

  it("verifyHmac rejects a stale timestamp beyond tolerance", () => {
    const stale = Math.floor(Date.now() / 1000) - 1000;
    const header = signWebhook(SECRET, stale, BODY);
    expect(verifyHmac({ secret: SECRET, header, rawBody: BODY, toleranceSec: 300 })).toBe(false);
  });

  it("verifyHmac rejects a malformed header", () => {
    expect(verifyHmac({ secret: SECRET, header: "garbage", rawBody: BODY, toleranceSec: 300 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/hmac.test.ts`
Expected: FAIL — `Failed to resolve import "./hmac"`.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/hmac.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function compute(secret: string, timestampSec: number, rawBody: string): string {
  return createHmac("sha256", secret)
    .update(`${timestampSec}.${rawBody}`)
    .digest("hex");
}

export function signWebhook(secret: string, timestampSec: number, rawBody: string): string {
  return `t=${timestampSec},v1=${compute(secret, timestampSec, rawBody)}`;
}

export function verifyHmac(args: {
  secret: string;
  header: string;
  rawBody: string;
  toleranceSec: number;
}): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(args.header.trim());
  if (!match) return false;
  const timestampSec = Number(match[1]);
  const provided = match[2]!;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSec) > args.toleranceSec) return false;

  const expected = compute(args.secret, timestampSec, args.rawBody);
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/hmac.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/hmac.ts packages/shared/src/hmac.test.ts
git commit -m "feat(shared): add HMAC webhook sign/verify with constant-time compare and replay window"
```

---

### Task 7: @xgamefi/shared SSRF guard (TDD — must reject metadata IP + DNS rebinding)

**Files:**
- Create: `packages/shared/src/ssrf.ts`
- Test: `packages/shared/src/ssrf.test.ts`

**Interfaces:**
- Consumes: Node `dns/promises`, `net`, global `fetch`.
- Produces (`@xgamefi/shared/ssrf`):
  ```ts
  function assertPublicUrl(rawUrl: string): Promise<URL>   // HTTPS-only; rejects private/loopback/link-local/metadata; resolves + pins IP
  function safeFetch(rawUrl: string, init?: RequestInit & { maxBytes?: number; timeoutMs?: number }): Promise<Response>
  ```
- The resolver is injectable (`assertPublicUrl(rawUrl, resolve?)`) so tests can simulate DNS rebinding without real network.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/ssrf.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assertPublicUrl, isBlockedIp } from "./ssrf";

// resolver stub: maps host -> IPs
const resolver = (map: Record<string, string[]>) => async (host: string) => {
  const ips = map[host];
  if (!ips) throw new Error(`no DNS for ${host}`);
  return ips;
};

describe("isBlockedIp", () => {
  it("blocks the cloud metadata IP 169.254.169.254", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });
  it("blocks loopback, private, and link-local ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.0.1")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
  });
  it("allows a public IP", () => {
    expect(isBlockedIp("93.184.216.34")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-HTTPS URLs", async () => {
    await expect(assertPublicUrl("http://example.com", resolver({ "example.com": ["93.184.216.34"] })))
      .rejects.toThrow(/HTTPS/);
  });

  it("rejects a host that resolves to the metadata IP (DNS rebinding)", async () => {
    await expect(
      assertPublicUrl("https://evil.example.com", resolver({ "evil.example.com": ["169.254.169.254"] })),
    ).rejects.toThrow(/blocked/i);
  });

  it("rejects when ANY resolved IP is private (rebinding to mixed answers)", async () => {
    await expect(
      assertPublicUrl("https://mixed.example.com", resolver({ "mixed.example.com": ["93.184.216.34", "10.0.0.5"] })),
    ).rejects.toThrow(/blocked/i);
  });

  it("accepts a public host and pins the resolved IP onto the URL", async () => {
    const url = await assertPublicUrl("https://example.com/items", resolver({ "example.com": ["93.184.216.34"] }));
    expect(url.hostname).toBe("example.com");
    expect((url as URL & { resolvedIp?: string }).resolvedIp).toBe("93.184.216.34");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/ssrf.test.ts`
Expected: FAIL — `Failed to resolve import "./ssrf"`.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/ssrf.ts`:
```ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inV4Range(ip: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const baseInt = ipv4ToInt(base!)!;
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16", // link-local incl. 169.254.169.254 metadata
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
];

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    return BLOCKED_V4.some((cidr) => inV4Range(n, cidr));
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (lower.startsWith("fe80")) return true; // link-local
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedIp(mapped[1]!);
    return false;
  }
  return true; // not a valid IP literal -> block
}

export async function assertPublicUrl(rawUrl: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  const ips = await resolve(url.hostname);
  if (ips.length === 0) throw new Error("Host did not resolve");
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new Error(`Host resolves to a blocked address: ${ip}`);
    }
  }
  (url as URL & { resolvedIp?: string }).resolvedIp = ips[0];
  return url;
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxBytes?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { maxBytes = 1_048_576, timeoutMs = 5000, ...rest } = init;
  const url = await assertPublicUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      ...rest,
      redirect: "error", // no redirects to disallowed hosts
      signal: controller.signal,
    });
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > maxBytes) {
      throw new Error(`Response exceeds maxBytes (${len} > ${maxBytes})`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
```

> `safeFetch` is the only sanctioned way to reach a studio URL; the eslint `no-restricted-globals` rule from Task 1 nudges callers toward it. The eslint rule does not run inside `ssrf.ts` itself — add `// eslint-disable-next-line no-restricted-globals` above the `fetch(` call when wiring eslint in Task 13.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/ssrf.test.ts`
Expected: PASS — metadata IP, loopback/private/link-local, DNS-rebinding (single + mixed answers), HTTPS-only, and IP-pinning cases all green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ssrf.ts packages/shared/src/ssrf.test.ts
git commit -m "feat(shared): add SSRF guard (assertPublicUrl/safeFetch) rejecting metadata IP and DNS rebinding"
```

---

### Task 8: @xgamefi/shared Stellar helpers (TDD against mocked Horizon)

**Files:**
- Create: `packages/shared/src/stellar.ts`
- Test: `packages/shared/src/stellar.test.ts`

**Interfaces:**
- Consumes: `@stellar/stellar-sdk`, `env` (`STELLAR_*`), `Prisma.Decimal`, `@xgamefi/shared/money`.
- Produces (`@xgamefi/shared/stellar`):
  ```ts
  type Asset = { code: "XLM" } | { code: string; issuer: string }
  function buildPaymentXdr(args: { destination: string; asset: Asset; amount: string; memo: string; source: string }): Promise<string>
  type VerifyResult = { ok: true; txHash: string; amount: Prisma.Decimal; memo: string; asset: Asset } | { ok: false; reason: string }
  function verifyPayment(args: { txHash?: string; expectedDestination: string; expectedAsset: Asset; minAmount: Prisma.Decimal; expectedMemo: string }): Promise<VerifyResult>
  function sendPayment(args: { destination: string; asset: Asset; amount: string; memo?: string }): Promise<{ txHash: string }>
  ```
- `verifyPayment` accepts an injectable Horizon client (`verifyPayment(args, horizon?)`) so tests mock Horizon without network. Phase 0 ships a working `buildPaymentXdr` + `verifyPayment`; `sendPayment` is a thin signer wrapper exercised live in Phase 3 (its unit test asserts only that it throws without a funded signer / is exported).

- [ ] **Step 1: Write the failing test**

`packages/shared/src/stellar.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { buildPaymentXdr, verifyPayment, type Asset } from "./stellar";

const DEST = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const SRC = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const USDT: Asset = { code: "USDT", issuer: DEST };

// Minimal Horizon stub: one payment-op record + tx memo.
function horizonStub(record: {
  txHash: string;
  to: string;
  amount: string;
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  memo: string;
  successful: boolean;
}) {
  return {
    transactions: () => ({
      transaction: (_h: string) => ({
        call: async () => ({
          hash: record.txHash,
          successful: record.successful,
          memo: record.memo,
          memo_type: "text",
        }),
      }),
    }),
    operations: () => ({
      forTransaction: (_h: string) => ({
        call: async () => ({
          records: [
            {
              type: "payment",
              to: record.to,
              amount: record.amount,
              asset_type: record.assetType,
              asset_code: record.assetCode,
              asset_issuer: record.assetIssuer,
            },
          ],
        }),
      }),
    }),
  } as unknown as Parameters<typeof verifyPayment>[1];
}

describe("buildPaymentXdr", () => {
  it("returns a base64 XDR string for a USDT payment with a text memo", async () => {
    const xdr = await buildPaymentXdr({
      destination: DEST,
      asset: USDT,
      amount: "1.0000000",
      memo: "ord_abc",
      source: SRC,
    });
    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(0);
    expect(() => Buffer.from(xdr, "base64")).not.toThrow();
  });
});

describe("verifyPayment", () => {
  const base = {
    expectedDestination: DEST,
    expectedAsset: USDT,
    minAmount: new Prisma.Decimal("1"),
    expectedMemo: "ord_abc",
    txHash: "abc123",
  };

  it("ok=true when destination, asset, amount>=min, and memo all match", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: true,
    }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.amount.equals(new Prisma.Decimal("1"))).toBe(true);
  });

  it("ok=false when the memo does not match", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_OTHER", successful: true,
    }));
    expect(res.ok).toBe(false);
  });

  it("ok=false when the amount is below minAmount", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "0.5000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: true,
    }));
    expect(res.ok).toBe(false);
  });

  it("ok=false when paid to the wrong destination", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: SRC, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: true,
    }));
    expect(res.ok).toBe(false);
  });

  it("ok=false when the transaction was not successful", async () => {
    const res = await verifyPayment(base, horizonStub({
      txHash: "abc123", to: DEST, amount: "1.0000000",
      assetType: "credit_alphanum4", assetCode: "USDT", assetIssuer: DEST,
      memo: "ord_abc", successful: false,
    }));
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/stellar.test.ts`
Expected: FAIL — `Failed to resolve import "./stellar"`.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/stellar.ts`:
```ts
import {
  Horizon,
  Asset as StellarAsset,
  Operation,
  TransactionBuilder,
  Memo,
  Networks,
  BASE_FEE,
  Keypair,
} from "@stellar/stellar-sdk";
import { Prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { fromStellarAmount } from "./money.js";

export type Asset = { code: "XLM" } | { code: string; issuer: string };

function toStellarAsset(asset: Asset): StellarAsset {
  return asset.code === "XLM" && !("issuer" in asset)
    ? StellarAsset.native()
    : new StellarAsset(asset.code, (asset as { issuer: string }).issuer);
}

function networkPassphrase(): string {
  return env.STELLAR_NETWORK === "pubnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function horizonServer(): Horizon.Server {
  return new Horizon.Server(env.STELLAR_HORIZON_URL);
}

export async function buildPaymentXdr(args: {
  destination: string;
  asset: Asset;
  amount: string;
  memo: string;
  source: string;
}): Promise<string> {
  const server = horizonServer();
  const account = await server.loadAccount(args.source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: args.destination,
        asset: toStellarAsset(args.asset),
        amount: args.amount,
      }),
    )
    .addMemo(Memo.text(args.memo))
    .setTimeout(180)
    .build();
  return tx.toXDR();
}

export type VerifyResult =
  | { ok: true; txHash: string; amount: Prisma.Decimal; memo: string; asset: Asset }
  | { ok: false; reason: string };

type HorizonLike = Pick<Horizon.Server, "transactions" | "operations">;

function assetMatches(
  expected: Asset,
  op: { asset_type: string; asset_code?: string; asset_issuer?: string },
): boolean {
  if (expected.code === "XLM" && !("issuer" in expected)) {
    return op.asset_type === "native";
  }
  const exp = expected as { code: string; issuer: string };
  return op.asset_code === exp.code && op.asset_issuer === exp.issuer;
}

export async function verifyPayment(
  args: {
    txHash?: string;
    expectedDestination: string;
    expectedAsset: Asset;
    minAmount: Prisma.Decimal;
    expectedMemo: string;
  },
  horizon: HorizonLike = horizonServer(),
): Promise<VerifyResult> {
  if (!args.txHash) return { ok: false, reason: "missing txHash" };

  const tx = await horizon.transactions().transaction(args.txHash).call();
  if (!tx.successful) return { ok: false, reason: "transaction not successful" };
  if (tx.memo !== args.expectedMemo) return { ok: false, reason: "memo mismatch" };

  const ops = await horizon.operations().forTransaction(args.txHash).call();
  const payment = ops.records.find(
    (r) =>
      r.type === "payment" &&
      (r as { to: string }).to === args.expectedDestination &&
      assetMatches(args.expectedAsset, r as never),
  ) as { amount: string } | undefined;

  if (!payment) return { ok: false, reason: "no matching payment op (destination/asset)" };

  const amount = fromStellarAmount(payment.amount);
  if (amount.lessThan(args.minAmount)) return { ok: false, reason: "amount below minimum" };

  return { ok: true, txHash: tx.hash, amount, memo: tx.memo, asset: args.expectedAsset };
}

export async function sendPayment(args: {
  destination: string;
  asset: Asset;
  amount: string;
  memo?: string;
}): Promise<{ txHash: string }> {
  const server = horizonServer();
  const signer = Keypair.fromSecret(env.STELLAR_PAYOUT_SIGNER_SECRET);
  const account = await server.loadAccount(signer.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  }).addOperation(
    Operation.payment({
      destination: args.destination,
      asset: toStellarAsset(args.asset),
      amount: args.amount,
    }),
  );
  if (args.memo) builder.addMemo(Memo.text(args.memo));
  const tx = builder.setTimeout(180).build();
  tx.sign(signer);
  const res = await server.submitTransaction(tx);
  return { txHash: res.hash };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/stellar.test.ts`
Expected: PASS — `buildPaymentXdr` returns base64; `verifyPayment` matches on all five mocked-Horizon cases. (`buildPaymentXdr` loads the source account from Horizon; if the CI runner has no outbound network, mark that single test `it.skipIf(!process.env.STELLAR_E2E)` — the verify tests are fully offline via the stub.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/stellar.ts packages/shared/src/stellar.test.ts
git commit -m "feat(shared): add Stellar helpers (buildPaymentXdr/verifyPayment/sendPayment) with mocked-Horizon tests"
```

---

### Task 9: db:seed script (admin argon2id + Gridlock + shop + Sword Skin + filler)

**Files:**
- Create: `packages/db/prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma`, `Prisma` from `@xgamefi/db`; `env` (`ADMIN_USERNAME`/`ADMIN_PASSWORD`, `STELLAR_USD_ASSET_*`); `argon2`; `signWebhook` secret hashing via `argon2`.
- Produces: idempotent seed creating admin `User` (`ADMIN`), `Studio` (`slug: gridlock`, BRAND colors, testnet payout wallet, webhook secret hash), published `Shop`, "Sword Skin" `Item` @ `1 USDT`, plus filler items.

- [ ] **Step 1: Write the seed script**

`packages/db/prisma/seed.ts`:
```ts
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { prisma, Prisma } from "../src/index.js";
import { env } from "@xgamefi/config/env";

const GRIDLOCK_BRAND = {
  primary: "#c3f400",
  secondary: "#fe00fe",
  background: "#131313",
  logo: null,
};
// Testnet payout wallet (demo placeholder; rotate before pubnet).
const GRIDLOCK_PAYOUT_WALLET = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const FILLER_ITEMS = [
  { externalId: "phase_core_02", name: "Phase Core", rarity: "EPIC", category: "core", price: "5", description: "Overclocked phase core." },
  { externalId: "neon_blade_03", name: "Neon Blade", rarity: "RARE", category: "blade", price: "3", description: "Cyan-edge neon blade." },
  { externalId: "obsidian_hull_04", name: "Obsidian Hull", rarity: "LEGENDARY", category: "armor", price: "12", description: "Matte obsidian hull plating." },
];

async function main() {
  const passwordHash = await argon2.hash(env.ADMIN_PASSWORD, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { username: env.ADMIN_USERNAME },
    update: { passwordHash, role: "ADMIN", isActive: true },
    create: { username: env.ADMIN_USERNAME, passwordHash, role: "ADMIN", isActive: true },
  });

  // Webhook secret is generated once; only its hash is stored (secret shown to studio out-of-band).
  const webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
  const webhookSecretHash = await argon2.hash(webhookSecret, { type: argon2.argon2id });

  const studio = await prisma.studio.upsert({
    where: { slug: "gridlock" },
    update: {
      name: "Gridlock Games",
      brand: GRIDLOCK_BRAND,
      payoutWalletAddress: GRIDLOCK_PAYOUT_WALLET,
      status: "ACTIVE",
      platformFeeBps: env.PLATFORM_FEE_BPS,
      integrationMode: "WEBHOOK_PUSH",
    },
    create: {
      name: "Gridlock Games",
      slug: "gridlock",
      description: "Anchor partner — Neon Overdrive gear.",
      brand: GRIDLOCK_BRAND,
      payoutWalletAddress: GRIDLOCK_PAYOUT_WALLET,
      webhookSecretHash,
      status: "ACTIVE",
      platformFeeBps: env.PLATFORM_FEE_BPS,
      integrationMode: "WEBHOOK_PUSH",
    },
  });

  const swordSkin = await prisma.item.upsert({
    where: { studioId_externalId: { studioId: studio.id, externalId: "sword_skin_01" } },
    update: {
      name: "Sword Skin",
      priceAmount: new Prisma.Decimal("1"),
      priceCurrency: "USDT",
      isActive: true,
    },
    create: {
      studioId: studio.id,
      externalId: "sword_skin_01",
      name: "Sword Skin",
      description: "The demo Sword Skin — acid-lime rim light.",
      priceAmount: new Prisma.Decimal("1"),
      priceCurrency: "USDT",
      rarity: "LEGENDARY",
      category: "skin",
      stock: null,
      isActive: true,
      syncedAt: new Date(),
    },
  });

  for (const f of FILLER_ITEMS) {
    await prisma.item.upsert({
      where: { studioId_externalId: { studioId: studio.id, externalId: f.externalId } },
      update: {},
      create: {
        studioId: studio.id,
        externalId: f.externalId,
        name: f.name,
        description: f.description,
        priceAmount: new Prisma.Decimal(f.price),
        priceCurrency: "USDT",
        rarity: f.rarity,
        category: f.category,
        stock: null,
        isActive: true,
        syncedAt: new Date(),
      },
    });
  }

  await prisma.shop.upsert({
    where: { studioId: studio.id },
    update: { status: "PUBLISHED", featuredItemIds: [swordSkin.id], publishedAt: new Date() },
    create: {
      studioId: studio.id,
      status: "PUBLISHED",
      layout: { mode: "grid", sections: [{ title: "FEATURED", itemIds: [swordSkin.id] }] },
      theme: GRIDLOCK_BRAND,
      featuredItemIds: [swordSkin.id],
      publishedAt: new Date(),
    },
  });

  console.log(
    `Seed complete: admin=${admin.username} studio=${studio.slug} swordSkin=${swordSkin.id} (${FILLER_ITEMS.length} filler items)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

> The seed is **idempotent** (all `upsert`) so re-running it is safe (`AGENT.md` golden rule 4). The webhook secret is regenerated only on first create; on re-run the existing hash is preserved.

- [ ] **Step 2: Run the seed against a fresh, migrated database**

Run: `docker compose up -d postgres && pnpm --filter @xgamefi/db exec prisma migrate deploy`
Then: `pnpm db:seed`
Expected: prints `Seed complete: admin=admin studio=gridlock swordSkin=<uuid> (3 filler items)`.

- [ ] **Step 3: Verify the acceptance gate rows exist (admin + Gridlock + Sword Skin@1 USDT)**

Run:
```bash
pnpm --filter @xgamefi/db exec tsx -e "
import { prisma } from './src/index.ts';
const admin = await prisma.user.findUnique({ where: { username: process.env.ADMIN_USERNAME }, select: { role: true } });
const studio = await prisma.studio.findUnique({ where: { slug: 'gridlock' }, select: { status: true } });
const sword = await prisma.item.findFirst({ where: { externalId: 'sword_skin_01' }, select: { name: true, priceAmount: true, priceCurrency: true } });
const shop = await prisma.shop.findFirst({ where: { studio: { slug: 'gridlock' } }, select: { status: true } });
console.log(JSON.stringify({ admin, studio, sword: { ...sword, priceAmount: sword?.priceAmount.toString() }, shop }));
await prisma.\$disconnect();
"
```
Expected: `{"admin":{"role":"ADMIN"},"studio":{"status":"ACTIVE"},"sword":{"name":"Sword Skin","priceAmount":"1","priceCurrency":"USDT"},"shop":{"status":"PUBLISHED"}}`.

- [ ] **Step 4: Verify idempotency (re-run does not error or duplicate)**

Run: `pnpm db:seed && pnpm --filter @xgamefi/db exec tsx -e "import { prisma } from './src/index.ts'; console.log(await prisma.item.count({ where: { externalId: 'sword_skin_01' } })); await prisma.\$disconnect();"`
Expected: seed prints `Seed complete...` again; count is `1` (no duplicate Sword Skin).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat(db): add idempotent seed (admin argon2id, Gridlock, published shop, Sword Skin@1 USDT, filler)"
```

---

### Task 10: apps/web — Next 16 shell + Tailwind v4 @theme + fonts + security headers

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`
- Create: `packages/config/tailwind-theme.css`
- Create: `apps/web/app/globals.css`, `apps/web/app/fonts.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `@xgamefi/config/tailwind` (`@theme` tokens); `next/font`.
- Produces: a booting Next 16 App Router app with BRAND `@theme`, Space Grotesk + JetBrains Mono fonts, Material Symbols, and security headers (CSP/HSTS/X-Content-Type-Options/Referrer-Policy/frame-ancestors).

- [ ] **Step 1: Create the web package manifest, tsconfig, and postcss config**

`apps/web/package.json`:
```json
{
  "name": "@xgamefi/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "16.2.0",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "@xgamefi/config": "workspace:*",
    "@xgamefi/db": "workspace:*",
    "@xgamefi/shared": "workspace:*",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "tailwindcss": "^4.3.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 2: Create the shared Tailwind theme from BRAND.md**

`packages/config/tailwind-theme.css` (verbatim tokens from `BRAND.md` §3):
```css
@theme {
  /* surfaces */
  --color-background: #131313;
  --color-surface: #131313;
  --color-surface-container-lowest: #0e0e0e;
  --color-surface-container-low: #1c1b1b;
  --color-surface-container: #201f1f;
  --color-surface-container-high: #2a2a2a;
  --color-surface-container-highest: #353534;
  --color-surface-variant: #353534;
  --color-surface-bright: #3a3939;

  /* text / lines */
  --color-on-background: #e5e2e1;
  --color-on-surface: #e5e2e1;
  --color-on-surface-variant: #c4c9ac;
  --color-outline: #8e9379;
  --color-outline-variant: #444933;
  --color-inverse-surface: #e5e2e1;
  --color-inverse-on-surface: #313030;

  /* primary (note: brand green is *-fixed) */
  --color-primary: #ffffff;
  --color-primary-fixed: #c3f400;
  --color-primary-fixed-dim: #abd600;
  --color-primary-container: #c3f400;
  --color-surface-tint: #abd600;
  --color-inverse-primary: #506600;
  --color-on-primary: #283500;
  --color-on-primary-fixed: #161e00;
  --color-on-primary-fixed-variant: #3c4d00;
  --color-on-primary-container: #556d00;

  /* secondary / tertiary / error */
  --color-secondary: #ffabf3;
  --color-secondary-fixed: #ffd7f5;
  --color-secondary-fixed-dim: #ffabf3;
  --color-secondary-container: #fe00fe;
  --color-on-secondary: #5b005b;
  --color-on-secondary-container: #500050;
  --color-on-secondary-fixed: #380038;
  --color-on-secondary-fixed-variant: #810081;
  --color-tertiary: #ffffff;
  --color-tertiary-fixed: #7df4ff;
  --color-tertiary-fixed-dim: #00dbe9;
  --color-tertiary-container: #7df4ff;
  --color-on-tertiary: #00363a;
  --color-on-tertiary-container: #006f77;
  --color-on-tertiary-fixed: #002022;
  --color-on-tertiary-fixed-variant: #004f54;
  --color-error: #ffb4ab;
  --color-error-container: #93000a;
  --color-on-error: #690005;
  --color-on-error-container: #ffdad6;

  /* type */
  --font-display: "Space Grotesk", sans-serif;
  --font-body: "Space Grotesk", sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* layout */
  --spacing-gutter: 16px;
  --spacing-margin-mobile: 20px;
  --spacing-margin-desktop: 64px;
  --container-max: 1440px;

  /* radii — sharp by default */
  --radius-DEFAULT: 0.25rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
}
```

- [ ] **Step 3: Create globals.css, fonts, layout, and landing page**

`apps/web/app/globals.css`:
```css
@import "tailwindcss";
@import "@xgamefi/config/tailwind";

:root {
  --primary-glow: rgba(195, 244, 0, 0.4);
  --secondary-glow: rgba(255, 0, 255, 0.3);
}

body {
  background-color: var(--color-background);
  color: var(--color-on-background);
  font-family: var(--font-body);
}
::selection { background: #c3f400; color: #283500; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

`apps/web/app/fonts.ts`:
```ts
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
```

`apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { spaceGrotesk, jetBrainsMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "xGameFi",
  description: "Commerce infrastructure for game studios.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetBrainsMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="font-mono uppercase tracking-[0.1em] text-primary-fixed">
        xGameFi · SYSTEM STATUS: NOMINAL
      </h1>
    </main>
  );
}
```

- [ ] **Step 4: Create next.config.ts with security headers**

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

- [ ] **Step 5: Build and verify the shell boots with headers**

Run: `pnpm install && pnpm --filter @xgamefi/web build`
Expected: Next build succeeds; Tailwind compiles `globals.css` with the BRAND `@theme`.

Run (in one shell): `pnpm --filter @xgamefi/web start &` then `sleep 4 && curl -sI http://localhost:3000/ | grep -iE "content-security-policy|strict-transport-security|x-content-type-options"`
Expected: all three security headers present; kill the server after.

- [ ] **Step 6: Commit**

```bash
git add apps/web packages/config/tailwind-theme.css packages/config/package.json pnpm-lock.yaml
git commit -m "feat(web): add Next 16 shell with Tailwind v4 @theme, fonts, Material Symbols, security headers"
```

---

### Task 11: apps/web — /api/health + /api/ready route handlers (TDD)

**Files:**
- Create: `apps/web/app/api/health/route.ts`, `apps/web/app/api/ready/route.ts`
- Create: `apps/web/lib/redis.ts`
- Test: `apps/web/app/api/health/route.test.ts`
- Create: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: `prisma` from `@xgamefi/db`; `ioredis` from `env.REDIS_URL`.
- Produces: `GET /api/health` → `{ status: "ok" }` (200, liveness, no deps); `GET /api/ready` → `{ db, redis }` (200 when both reachable, 503 otherwise).

- [ ] **Step 1: Write the failing test**

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["**/*.test.ts"] } });
```

`apps/web/app/api/health/route.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@xgamefi/db", () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } }));
vi.mock("../../../lib/redis", () => ({ pingRedis: vi.fn().mockResolvedValue(true) }));

describe("/api/health", () => {
  it("returns 200 ok for liveness", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("/api/ready", () => {
  it("returns 200 with db+redis healthy", async () => {
    const { GET } = await import("../ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ db: "ok", redis: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web exec vitest run app/api/health/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/lib/redis.ts`:
```ts
import Redis from "ioredis";
import { env } from "@xgamefi/config/env";

let client: Redis | null = null;

function getRedis(): Redis {
  client ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const res = await getRedis().ping();
  return res === "PONG";
}
```

`apps/web/app/api/health/route.ts`:
```ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
```

`apps/web/app/api/ready/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@xgamefi/db";
import { pingRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = "fail";
  let redis = "fail";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "fail";
  }
  try {
    redis = (await pingRedis()) ? "ok" : "fail";
  } catch {
    redis = "fail";
  }
  const ok = db === "ok" && redis === "ok";
  return NextResponse.json({ db, redis }, { status: ok ? 200 : 503 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web exec vitest run app/api/health/route.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Verify live against running services**

Run: `docker compose up -d postgres redis && pnpm --filter @xgamefi/web start &` then `sleep 4 && curl -s http://localhost:3000/api/health && echo && curl -s http://localhost:3000/api/ready`
Expected: `{"status":"ok"}` then `{"db":"ok","redis":"ok"}`; kill the server after.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api apps/web/lib/redis.ts apps/web/vitest.config.ts
git commit -m "feat(web): add /api/health liveness and /api/ready (db+redis) readiness handlers with tests"
```

---

### Task 12: apps/worker — BullMQ + ioredis bootstrap + queue registry stubs

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`
- Create: `apps/worker/src/redis.ts`, `apps/worker/src/index.ts`
- Create: `packages/shared/src/queues.ts`
- Test: `apps/worker/src/index.test.ts`, `packages/shared/src/queues.test.ts`
- Create: `apps/worker/vitest.config.ts`

**Interfaces:**
- Consumes: `bullmq`, `ioredis`, `env.REDIS_URL`.
- Produces (`@xgamefi/shared/queues`):
  ```ts
  const QUEUE_NAMES = ["catalogue-sync","stellar-watcher","webhook-delivery","payout","p2p-settlement","referral-reward","refund"] as const
  type QueueName = (typeof QUEUE_NAMES)[number]
  function getQueue(name: QueueName): Queue
  function registerWorker(name: QueueName, processor: Processor): Worker
  ```
  All SPEC §9 queues registered as stubs; processors filled per phase.

- [ ] **Step 1: Write the failing queue-registry test**

`packages/shared/src/queues.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { QUEUE_NAMES } from "./queues";

describe("queues registry", () => {
  it("declares all seven SPEC §9 queue names", () => {
    expect([...QUEUE_NAMES].sort()).toEqual(
      [
        "catalogue-sync",
        "p2p-settlement",
        "payout",
        "referral-reward",
        "refund",
        "stellar-watcher",
        "webhook-delivery",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/queues.test.ts`
Expected: FAIL — `Failed to resolve import "./queues"`.

- [ ] **Step 3: Write the queue registry**

`packages/shared/src/queues.ts`:
```ts
import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { env } from "@xgamefi/config/env";

export const QUEUE_NAMES = [
  "catalogue-sync",
  "stellar-watcher",
  "webhook-delivery",
  "payout",
  "p2p-settlement",
  "referral-reward",
  "refund",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

let connection: IORedis | null = null;
function getConnection(): IORedis {
  connection ??= new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() });
    queues.set(name, q);
  }
  return q;
}

export function registerWorker(name: QueueName, processor: Processor): Worker {
  return new Worker(name, processor, { connection: getConnection() });
}
```

- [ ] **Step 4: Run the queue test to verify it passes**

Run: `pnpm --filter @xgamefi/shared exec vitest run src/queues.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Write the worker package, bootstrap, and its failing test**

`apps/worker/package.json`:
```json
{
  "name": "@xgamefi/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@xgamefi/shared": "workspace:*",
    "@xgamefi/config": "workspace:*",
    "@xgamefi/db": "workspace:*",
    "bullmq": "^5.34.0",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "noEmit": true },
  "include": ["src"]
}
```

`apps/worker/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

`apps/worker/src/index.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stubProcessor, registeredQueueNames } from "./index";
import { QUEUE_NAMES } from "@xgamefi/shared/queues";

describe("worker bootstrap", () => {
  it("plans a stub worker for every queue name", () => {
    expect(registeredQueueNames().sort()).toEqual([...QUEUE_NAMES].sort());
  });

  it("stubProcessor returns a not-implemented marker for any job", async () => {
    const result = await stubProcessor({ name: "noop", data: {} } as never);
    expect(result).toEqual({ handled: false, reason: "stub" });
  });
});
```

`apps/worker/src/redis.ts`:
```ts
import IORedis from "ioredis";
import { env } from "@xgamefi/config/env";

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
```

`apps/worker/src/index.ts`:
```ts
import type { Job, Processor, Worker } from "bullmq";
import { QUEUE_NAMES, registerWorker, type QueueName } from "@xgamefi/shared/queues";

// Phase 0: every queue gets a no-op stub processor. Phases 2–6 replace these.
export const stubProcessor: Processor = async (_job: Job) => {
  return { handled: false, reason: "stub" };
};

export function registeredQueueNames(): QueueName[] {
  return [...QUEUE_NAMES];
}

export function startWorkers(): Worker[] {
  return QUEUE_NAMES.map((name) => registerWorker(name, stubProcessor));
}

// Only auto-start when run as the entrypoint, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const workers = startWorkers();
  console.log(`worker ready: ${workers.length} queues registered (${QUEUE_NAMES.join(", ")})`);
}
```

- [ ] **Step 6: Run the worker test to verify it passes**

Run: `pnpm install && pnpm --filter @xgamefi/worker exec vitest run src/index.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 7: Verify the worker boots against Redis**

Run: `docker compose up -d redis && timeout 5 pnpm --filter @xgamefi/worker start || true`
Expected: prints `worker ready: 7 queues registered (catalogue-sync, stellar-watcher, webhook-delivery, payout, p2p-settlement, referral-reward, refund)`.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/queues.ts packages/shared/src/queues.test.ts apps/worker pnpm-lock.yaml
git commit -m "feat(worker): add BullMQ bootstrap and queue registry stubs for all SPEC §9 queues"
```

---

### Task 13: CI workflow (lint, tsc, test, prisma drift, audit)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `eslint.config.mjs` (root, consuming `@xgamefi/config/eslint`)

**Interfaces:**
- Consumes: root scripts `lint`/`typecheck`/`test`, `@xgamefi/db` `db:diff`, `@xgamefi/config/eslint`.
- Produces: a CI pipeline that fails on lint errors, type errors, test failures, Prisma schema drift, or high/critical audit findings.

- [ ] **Step 1: Create the root eslint flat config**

`eslint.config.mjs`:
```js
import preset from "@xgamefi/config/eslint";

export default [
  ...preset,
  { ignores: ["**/generated/**", "**/.next/**", "**/dist/**", "**/node_modules/**"] },
];
```

> Add `// eslint-disable-next-line no-restricted-globals` above the sanctioned `fetch(` call inside `packages/shared/src/ssrf.ts` (the one place a raw `fetch` is allowed) so lint passes.

- [ ] **Step 2: Verify lint, typecheck, and tests pass locally**

Run: `pnpm lint`
Expected: no errors (the only `fetch` is the disabled line in `ssrf.ts`).

Run: `pnpm typecheck`
Expected: `tsc --noEmit` clean across all packages.

Run: `pnpm test`
Expected: all vitest suites green (config env, shared money/hmac/ssrf/stellar/queues, web health/ready, worker bootstrap).

- [ ] **Step 3: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: user
          POSTGRES_PASSWORD: pass
          POSTGRES_DB: xgamefi
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U user -d xgamefi"
          --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s --health-timeout 5s --health-retries 10

    env:
      DATABASE_URL: postgresql://user:pass@localhost:5432/xgamefi
      SHADOW_DATABASE_URL: postgresql://user:pass@localhost:5432/xgamefi_shadow
      REDIS_URL: redis://localhost:6379

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with: { version: 10 }

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Load test env
        run: cp .env.test .env

      - name: Create shadow database
        run: PGPASSWORD=pass createdb -h localhost -U user xgamefi_shadow

      - name: Prisma generate
        run: pnpm db:generate

      - name: Prisma migrate deploy
        run: pnpm --filter @xgamefi/db exec prisma migrate deploy

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Prisma drift check
        run: pnpm --filter @xgamefi/db db:diff

      - name: Audit (fail on high/critical)
        run: pnpm audit --audit-level high
```

> `db:diff` (defined in Task 4's `@xgamefi/db` package.json) exits non-zero when the committed migrations don't match `schema.prisma`, catching schema drift. `.env.test` provides the `STELLAR_*`/`S3_*`/`ADMIN_*` values the env schema requires at boot during `pnpm test`.

- [ ] **Step 4: Verify the drift check and audit pass locally**

Run: `docker compose up -d postgres && PGPASSWORD=pass createdb -h localhost -U user xgamefi_shadow 2>/dev/null; pnpm --filter @xgamefi/db db:diff && echo DRIFT_OK`
Expected: prints `DRIFT_OK` (no drift between migrations and schema).

Run: `pnpm audit --audit-level high`
Expected: exit 0 (no high/critical advisories) — if any appear, bump the offending dependency before merging.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml eslint.config.mjs packages/shared/src/ssrf.ts
git commit -m "ci: add lint/typecheck/test/prisma-drift/audit pipeline"
```

---

## Acceptance gate (Phase 0)

Run the full local verification before declaring the phase done:

```bash
docker compose up -d
cp .env.test .env
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @xgamefi/db exec prisma migrate deploy
pnpm db:seed            # → admin + Gridlock + published shop + Sword Skin@1 USDT
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @xgamefi/web build
```
Then boot both services: `pnpm --filter @xgamefi/web start` (curl `/api/health` + `/api/ready` → 200) and `pnpm --filter @xgamefi/worker start` (prints `worker ready: 7 queues registered`). **Gate met when:** `pnpm db:seed` creates admin + Gridlock + Sword Skin; both services boot; CI is green.

---

## Self-Review

**1. Spec coverage** (decomposition §4 Phase 0 scope):

| Phase 0 requirement | Task(s) |
| --- | --- |
| pnpm monorepo workspace + root scripts | 1 |
| `packages/config` eslint/tsconfig/tailwind presets | 1, 10 (tailwind), 13 (eslint) |
| Zod env schema parsed at boot, fail-fast + `.env.test` | 2 |
| `packages/db` FULL Prisma 7 schema (all SPEC §5 entities) | 4 |
| `prisma.config.ts` + pg driver adapter + single PrismaClient | 4 |
| `db:seed` (admin argon2id + Gridlock + published shop + Sword Skin@1 USDT + filler) | 9 |
| `packages/shared` money utils (tests-first) | 5 |
| `packages/shared` HMAC sign/verify (tests-first) | 6 |
| `packages/shared` SSRF guard — metadata IP + DNS rebinding (tests-first) | 7 |
| `packages/shared` Stellar helpers vs mocked Horizon (tests-first) | 8 |
| `apps/web` Next 16 shell + Tailwind v4 @theme from BRAND + next/font + Material Symbols + security headers | 10 |
| `/api/health` + `/api/ready` | 11 |
| `apps/worker` BullMQ + ioredis bootstrap + queue registry stubs | 12 |
| `docker-compose.yml` (PG17/Redis7/MinIO+createbuckets) | 3 |
| `.env.example` (every AGENT.md §12 var) + `.env.test` | 2 |
| CI (lint, tsc --noEmit, test, migrate diff drift, audit) | 13 |
| Acceptance gate (seed creates rows; services boot; CI green) | Acceptance gate section |

All 16 scope items are covered. Settlement / idempotency / auth modules are correctly deferred (canonical-interfaces marks them [P1]/[P3]); `sendPayment` is included as a thin wrapper (canonical-interfaces lists it under [P0] `@xgamefi/shared/stellar`) but is only fully exercised in Phase 3.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N"/"write tests for the above". Every code step shows real code; every scaffolding step shows real file contents and a concrete verification command. The only intentional stubs are the worker queue **processors** (explicitly Phase-0 scope per decomposition §4 and canonical-interfaces "filled per phase").

**3. Type consistency with canonical-interfaces:**
- `@xgamefi/config/env` → `env` object (Task 2) ✓
- `@xgamefi/db` → `prisma`, `Prisma` (Task 4) ✓
- `@xgamefi/shared/money` → `feeAmount`/`netAmount`/`toStellarAmount`/`fromStellarAmount` exact signatures (Task 5) ✓
- `@xgamefi/shared/hmac` → `signWebhook`/`verifyHmac` exact signatures + `t=<unix>,v1=<hex>` format (Task 6) ✓
- `@xgamefi/shared/ssrf` → `assertPublicUrl`/`safeFetch` (Task 7); resolver injection is an additive optional param, signature-compatible ✓
- `@xgamefi/shared/stellar` → `Asset` union, `buildPaymentXdr`/`verifyPayment` (`VerifyResult` union)/`sendPayment` exact signatures (Task 8); horizon injection is an additive optional param ✓
- `@xgamefi/shared/queues` → `getQueue(name)`/`registerWorker(name, processor)` + queue name list (Task 12) ✓
- HMAC/key/timestamp header names and `X-XGameFi-Signature` format match canonical-interfaces "API conventions" ✓

Fixes applied inline during review: added the explicit note that `WebhookEvent` enum uses `_` (Prisma cannot use `.`), with DTO mapping deferred to P3; clarified that `verifyPayment`/`assertPublicUrl` injectable params are additive and signature-compatible; clarified that `sendPayment` is P0-exported but P3-exercised.

**Spec-coverage gaps noticed (flagged, not blockers for Phase 0):**
- **`@xgamefi/shared/zod` and `@xgamefi/shared/dto`** subpaths are declared [P0+] in canonical-interfaces ("each phase adds its own") — there are no shared schemas/mappers to add yet in Phase 0, so no module is created. First real schemas land in Phase 1. This is expected, not a gap, but noted.
- **`@aws-sdk/client-s3` / s3-request-presigner** are pinned in AGENT.md §1 and a MinIO bucket is provisioned (Task 3), but no S3 client wrapper is built in Phase 0 (no upload feature exists until Phase 2 item images). Env vars and bucket are ready; the client is deferred.
- **`qrcode`, `jose`, `argon2` (web), `@stellar/freighter-api`** are in the AGENT.md stack but first used in Phases 1/3; only `argon2` (seed) and `@stellar/stellar-sdk` are wired in Phase 0, which matches the decomposition's "money/trust primitives early" intent.
