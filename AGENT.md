# AGENT.md — Engineering Guide for xGameFi

> You are the coding agent building **xGameFi** (see `SPEC.md` for what to build, `BRAND.md` for the visual system). This file is authoritative for *how* to build: stack, conventions, and a non-negotiable security bar. xGameFi moves real value on Stellar, so **security and correctness outrank speed and cleverness.**

---

## 0. Golden rules

1. **Never trust the client for money or authorization.** Verify every payment on-chain server-side; check roles/ownership on every endpoint.
2. **Use current stable, pinned dependencies** (§1). Don't introduce a package without checking it's maintained and on its latest stable.
3. **Money is `Decimal`, never `float`.** Use `bignumber.js`/`Prisma.Decimal`; Stellar amounts have 7 decimals (stroops).
4. **Everything is idempotent** where retries or webhooks are involved.
5. **Secrets live in env / Railway variables**, never in the repo, the DB in plaintext, or client bundles.
6. **Validate every input with Zod; return mapped DTOs**, never raw Prisma rows.
7. **Guard every studio-supplied URL against SSRF** before fetching/posting (§8).

---

## 1. Tech stack & pinned versions

Verified current as of **June 2026**. Pin majors; let patches float (`^`). Re-check `npm view <pkg> version` before locking.

| Area | Package | Version | Notes |
| --- | --- | --- | --- |
| Runtime | **Node.js** | **22 LTS** (≥20.9 required) | Next 16 & Stellar SDK need Node 20+; use 22 LTS. |
| Package mgr | **pnpm** | **10.x** | Workspaces. Commit `pnpm-lock.yaml`. |
| Framework | **next** | **16.2.x** | App Router, Turbopack default, `proxy.ts` (replaces middleware), async `cookies()/headers()/params`. |
| UI runtime | **react / react-dom** | **19.2.x** | Server Components default. |
| Language | **typescript** | **5.x** | `strict: true`. |
| ORM | **prisma** + **@prisma/client** | **7.x** (≥7.8) | **ESM-only, Rust-free.** `prisma.config.ts`, driver adapter required, seed runs **explicitly**. |
| DB driver | **pg** + **@prisma/adapter-pg** | latest | Driver adapter for Prisma 7. |
| DB | **PostgreSQL** | **17** | Railway managed. |
| Styling | **tailwindcss** + **@tailwindcss/postcss** | **4.3.x** | CSS-first `@theme` (no `tailwind.config.js`). See `BRAND.md`. |
| Components | **shadcn/ui** (+ Radix) | latest | For builder/dashboard primitives; restyle to `BRAND.md`. |
| Stellar | **@stellar/stellar-sdk** | **15.1.x** | Horizon + RPC. |
| Wallet | **@stellar/freighter-api** | **5.x** | Client-only. |
| Money math | **bignumber.js** | latest | Decimal arithmetic. |
| Queues | **bullmq** + **ioredis** | latest | Worker jobs on Redis. |
| Cache/locks | **Redis** | **7.x** | Sessions, queues, locks, rate-limit, idempotency. |
| Object store | **@aws-sdk/client-s3** + **@aws-sdk/s3-request-presigner** | latest | S3/MinIO. |
| Password hash | **argon2** | latest | argon2id. |
| Sessions/JWT | **jose** | latest | Signed cookie tokens / JWS if needed. |
| Validation | **zod** | latest | Inputs + env parsing. |
| QR | **qrcode** | latest | Demo scan-to-pay. |
| Lint/format | **eslint** (`eslint-config-next`) + **prettier** (or **biome**) | latest | CI-enforced. |
| Tests | **vitest** + **@playwright/test** | latest | Unit/integration + e2e. |

---

## 2. Repository layout (pnpm workspace)

```
xgamefi/
├─ apps/
│  ├─ web/                  # Next.js 16 app (App Router) — UI + /api/v1 route handlers
│  └─ worker/               # BullMQ consumers (catalogue-sync, stellar-watcher, payout, …)
├─ packages/
│  ├─ db/                   # Prisma schema, prisma.config.ts, client, migrations, seed
│  ├─ shared/               # Zod schemas, DTOs, money utils, Stellar helpers, HMAC, SSRF guard
│  └─ config/               # eslint/ts/tailwind presets, env schema
├─ docker-compose.yml       # dev: postgres, redis, minio (+createbuckets)
├─ .env.example             # every var, no secrets
├─ pnpm-workspace.yaml
└─ railway.json / service configs
```

Keep all Stellar verification, fee math, HMAC, and SSRF logic in `packages/shared` so web and worker share one implementation.

---

## 3. Setup & common commands

```bash
pnpm install
cp .env.example .env                 # fill values
docker compose up -d                 # postgres + redis + minio (dev only)
pnpm --filter @xgamefi/db prisma migrate dev
pnpm --filter @xgamefi/db prisma generate
pnpm --filter @xgamefi/db db:seed    # creates admin + Gridlock demo (Prisma 7: seed is explicit)
pnpm --filter web dev                # Next.js
pnpm --filter worker dev             # queue consumers
```

---

## 4. Next.js 16 specifics

- **App Router only.** Server Components by default; mark client islands (`"use client"`) narrowly — wallet connect, builder canvas, live SSE feed.
- `cookies()`, `headers()`, `params`, and `searchParams` are **async** — always `await` them.
- **`proxy.ts` replaces `middleware.js`.** Use it for coarse auth gating, but **do not rely on it as the only auth check** — Next has shipped multiple middleware/proxy *bypass* CVEs (2025–2026). Enforce authZ again inside every route handler / server action (defense in depth).
- Prefer **Server Actions** for dashboard mutations and **route handlers** for the public/machine API and anything needing custom headers (HMAC, SSE, idempotency).
- Add security headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors) via config/proxy. No secrets in `NEXT_PUBLIC_*`.
- Keep `next` patched — apply security releases promptly.

## 5. Prisma 7 specifics

- ESM-only; configure via **`prisma.config.ts`** (env not auto-loaded — load it yourself). Use the **`prisma-client` generator with an explicit `output`** and instantiate the client with the **pg driver adapter**.
- `migrate dev`/`db push` **no longer auto-generate or auto-seed** — run `prisma generate` and `db:seed` explicitly (in dev, CI, and the Railway release step).
- Single `PrismaClient` instance (avoid hot-reload leaks). Wrap multi-step money operations in `prisma.$transaction`. Treat applied migrations as immutable; provision a shadow DB in CI for drift detection.
- **Seed script** creates the admin (argon2id from `ADMIN_USERNAME`/`ADMIN_PASSWORD`) and Gridlock demo data per `SPEC.md §13`.

## 6. Tailwind v4 specifics

CSS-first: `@import "tailwindcss";` + the `@theme` block from `BRAND.md` in `app/globals.css`. There is **no `tailwind.config.js`**. The mock's JS config is reference only — translate its tokens into `@theme`. Use `next/font` for Space Grotesk + JetBrains Mono.

---

## 7. Auth implementation

- **Platform/studio:** username + password, **argon2id**. On login, issue an httpOnly, `Secure`, `SameSite=Lax` session cookie holding an opaque session id; store the session in Redis (+ a `Session` row for revocation/audit). Short idle expiry + sliding refresh.
- **CSRF:** for cookie-authenticated state-changing requests use `SameSite` + an Origin/Referer check, or a double-submit token. Server Actions get the same protection.
- **Players (wallet):** issue a one-time `AuthChallenge` nonce; verify the Freighter signature server-side; bind a player session cookie to the wallet. Nonces are single-use and time-boxed.
- **RBAC:** central guard mapping `ADMIN/STUDIO_*/PLAYER` → allowed resources; **always** re-scope studio queries by `studioId`.
- **Rate-limit** auth, checkout, and listing endpoints in Redis. Lock/backoff on repeated login failures. Log auth events to `AuditLog` (no passwords/secrets).

---

## 8. Stellar & money handling

- **Verify, don't trust.** After a client reports payment, confirm on Horizon: destination = platform account, asset matches (`XLM` native or configured issuer/code), `amount ≥ quoted`, **memo binds to the order/trade**, and the `txHash` is unused (DB-unique). Only then advance state and write a `LedgerEntry`.
- Prefer a server-side **`stellar-watcher`** that streams Horizon and matches by memo, so confirmation doesn't depend on the browser staying open (critical for the live demo).
- **Decimals:** `bignumber.js`; format to 7 dp for Stellar; round fees deterministically; fee in `platformFeeBps`. Never use JS `number` for amounts.
- **Key management:** the payout signer secret comes from env/secret manager (KMS ideally) — never in DB/client/logs. Separate receiving/escrow account from the signer where practical. Use distinct testnet vs pubnet config; demo runs on **testnet**.
- **Idempotency:** `checkout/submit`, `p2p buy/submit`, payout, and reward jobs key off entity status so a retry can never double-pay or double-grant.
- **Escrow:** release P2P funds only after confirmed item transfer; otherwise time-boxed auto-refund.

### SSRF guard (mandatory for `apiBaseUrl` & `webhookUrl`)
Both URLs are studio-supplied and are fetched/posted to by the server. For every outbound call: require **HTTPS**; resolve the host and **reject private, loopback, link-local, and cloud-metadata ranges** (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `169.254.169.254`); pin the resolved IP to defeat **DNS rebinding**; set strict timeouts and a **response-size cap**; disable redirects to disallowed hosts. Centralize this in `packages/shared` and use it everywhere — no raw `fetch` to studio URLs.

---

## 9. Webhooks

- **Outbound (to game dev):** sign with HMAC-SHA256 over `timestamp + "." + rawBody` using the studio's `webhookSecret`; send `X-XGameFi-Signature: t=<unix>,v1=<hmac>`. Deliver via the `webhook-delivery` queue with exponential backoff (≈5 attempts) → DLQ + `EXHAUSTED`. Persist every attempt in `WebhookDelivery`; expose retry. Treat the game's `2xx` as grant confirmation; otherwise `purchase.pending`/`failed`.
- **Inbound (`/ingest/*`):** authenticate by API key, verify HMAC + timestamp (reject >5 min skew, constant-time compare), enforce idempotency, and rate-limit.

---

## 10. Testing & quality

- **Unit:** fee/discount math, money rounding, HMAC sign/verify, SSRF guard (must reject metadata IP + rebinding), promotion logic.
- **Integration:** route handlers against a disposable Postgres (Testcontainers/compose) + Prisma; mock Horizon or use testnet.
- **E2E (Playwright):** the **demo path** — connect wallet → quote → pay (testnet/stub) → order `PAID` → `DELIVERED` → signed webhook delivered → SSE feed updates.
- CI: `pnpm lint`, `tsc --noEmit`, `pnpm test`, `prisma migrate diff` drift check, and `pnpm audit` (fail on high/critical). Type-check is green or the PR doesn't merge.

---

## 11. Deployment (Railway)

Services: **web** (Next.js), **worker** (BullMQ), managed **Postgres**, managed **Redis**, and **MinIO** (S3-compatible) or a volume for object storage.

- Build `pnpm install --frozen-lockfile && pnpm --filter web build`; start `pnpm --filter web start`. Worker: `pnpm --filter worker start`.
- **Release/deploy step runs migrations + generate** (and seed only on first deploy / explicitly): `prisma migrate deploy && prisma generate`. Never auto-seed production with the demo admin beyond the intended bootstrap.
- Health checks: `/api/health` (liveness), `/api/ready` (DB+Redis readiness).
- All config via Railway variables; rotate the admin password and webhook secrets after the first deploy. Separate testnet vs pubnet environments.

---

## 12. Environment variables (`.env.example`)

```dotenv
# Core
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=change-me-32-bytes-min

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
STELLAR_NETWORK=testnet                # testnet | pubnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_RECEIVING_ACCOUNT=G...         # collects sales + escrow
STELLAR_PAYOUT_SIGNER_SECRET=S...      # NEVER commit; secret manager in prod
STELLAR_USD_ASSET_CODE=USDT
STELLAR_USD_ASSET_ISSUER=G...          # configured stablecoin issuer
PLATFORM_FEE_BPS=500                   # default platform fee (TBD)

# Webhooks
WEBHOOK_MAX_ATTEMPTS=5
WEBHOOK_TIMESTAMP_TOLERANCE_SEC=300
```

Parse and validate env at boot with Zod; fail fast on missing/invalid values. Provide a matching `.env.test`.

---

## 13. Dev services — `docker-compose.yml`

Provide Postgres 17, Redis 7, and MinIO (with a bucket-create init), so the app runs locally without cloud dependencies:

```yaml
services:
  postgres:
    image: postgres:17
    environment: { POSTGRES_USER: user, POSTGRES_PASSWORD: pass, POSTGRES_DB: xgamefi }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }
    ports: ["9000:9000", "9001:9001"]
    volumes: ["minio:/data"]
  createbuckets:
    image: minio/mc
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "until (mc alias set local http://minio:9000 minioadmin minioadmin) do sleep 1; done;
      mc mb -p local/xgamefi; mc anonymous set download local/xgamefi; exit 0;"
volumes: { pgdata: {}, minio: {} }
```

---

## 14. Definition of done (PR checklist)

- [ ] Inputs validated with Zod; responses are mapped DTOs.
- [ ] AuthZ checked in the handler/action (not just `proxy.ts`); studio queries scoped by `studioId`.
- [ ] Money uses `Decimal`/`bignumber.js`; fees deterministic; no `float`.
- [ ] Payment paths verify on-chain (destination/asset/amount/memo, unique `txHash`) and are idempotent.
- [ ] Outbound calls to studio URLs go through the SSRF guard; webhooks signed; inbound HMAC verified.
- [ ] No secrets in code/logs/`NEXT_PUBLIC_*`; env validated at boot.
- [ ] Tests added (unit + the demo e2e where relevant); `lint`, `tsc`, `test`, `audit` pass.
- [ ] Migrations included and `migrate deploy`-safe; seed unaffected or updated intentionally.

## 15. Do NOT

Trust client-reported payment success · use `float` for money · store Stellar/webhook secrets in the DB or ship them to the client · rely solely on `proxy.ts`/middleware for auth · `fetch`/POST a studio URL without the SSRF guard · skip idempotency on payment/webhook paths · expose stack traces or raw Prisma errors to clients · auto-run the demo seed in production beyond bootstrap · pin to abandoned/pre-release dependency versions.
