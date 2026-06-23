# Phase 7 — Admin & Ops Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the platform admin console (metrics/ledger/studios/users/settings), the studio API-key + webhook management surface (issue-once keys, SSRF-validated webhook URL, delivery log + manual retry + signed test), and the production hardening pass (full audit-log + rate-limit coverage, security headers/CSP, Railway deploy config with migrate-deploy-safe release step, and the Phase-3 Playwright demo e2e wired in as the headline CI gate).

**Architecture:** Reuse the entire money/auth/queue core from Phases 0–6 unchanged. Admin endpoints sit under `apps/web/app/api/v1/admin/*` and are gated by `requireRole("ADMIN")`; studio key/webhook endpoints sit under `apps/web/app/api/v1/studios/[id]/*` gated by `requireStudio(id)`. All read aggregation queries hit `LedgerEntry`/`Order`/`Studio`/`User`/`WebhookDelivery` and return mapped DTOs. Admin/studio pages are Server Components in the `(admin)` route group styled per BRAND.md. Manual webhook retry re-enqueues onto the existing `webhook-delivery` queue via `getQueue`. Deploy config is `railway.json` per service with a release step `prisma migrate deploy && prisma generate` (seed is bootstrap-only, never auto-run in prod).

**Tech Stack:** Next.js 16.2.x (App Router, async `cookies()/headers()/params`, `proxy.ts`), React 19.2.x (Server Components), Prisma 7.x (pg driver adapter), TypeScript 5.x (`strict`), Tailwind v4.3.x (CSS-first `@theme`), BullMQ + ioredis, Zod, Vitest + Playwright, Railway (web + worker services), pnpm 10.x workspaces.

## Global Constraints

- All admin endpoints (`/api/v1/admin/*`) call `await requireRole("ADMIN")` in the handler — never rely on `proxy.ts` alone (defense in depth; multiple proxy-bypass CVEs).
- Studio key/webhook endpoints call `await requireStudio(id)` (allows ADMIN or a member of `studioId`); studio-scoped queries always pass through `scopeToStudio`.
- API keys are stored hashed (`keyPrefix` + `hashedKey`); the full key is returned exactly ONCE on issue and never retrievable again.
- Every studio-supplied webhook URL is SSRF-validated via `assertPublicUrl` before it is persisted on `PATCH /studios/:id/webhook`.
- Never auto-seed the production database with the demo admin/Gridlock data beyond the intended one-time bootstrap; the Railway release step runs `prisma migrate deploy && prisma generate` only.
- Migrations are included and `migrate deploy`-safe (additive, no destructive rewrites of applied migrations).
- All inputs validated with Zod; all responses are mapped DTOs — never raw Prisma rows, never stack traces, never raw Prisma errors to clients.
- AuditLog is written for every sensitive admin/studio action (settings change, fee change, studio approve/suspend, key issue/revoke, webhook URL set/secret rotate, manual retry) with `actorUserId`, `action`, `entityType`, `entityId`, `metadata`, `ip` — never passwords/secrets.
- Money is `Prisma.Decimal`, formatted to 7 dp via `toStellarAmount`; aggregation uses Decimal/`bignumber.js`, never JS `number`.
- Rate-limiting is confirmed/extended in Redis across auth, checkout, and listing endpoints.
- Pinned versions per AGENT.md §1: Node 22 LTS, pnpm 10.x, next 16.2.x, react 19.2.x, prisma 7.x (≥7.8), tailwindcss 4.3.x, @stellar/stellar-sdk 15.1.x, bullmq/ioredis latest. Deployed on Railway (services `web` + `worker`, managed Postgres 17 + Redis 7).

---

## File Structure

**Shared package (`packages/shared`)**
- `packages/shared/src/dto/admin.ts` — `toAdminMetricsDto`, `toAdminLedgerEntryDto`, `toAdminSettingsDto`, `toAdminStudioDto`, `toAdminUserDto` mappers (pure).
- `packages/shared/src/dto/studioKey.ts` — `toApiKeyDto` (never includes the raw key or hashedKey).
- `packages/shared/src/dto/webhookDelivery.ts` — `toWebhookDeliveryDto` mapper.
- `packages/shared/src/zod/admin.ts` — `AdminSettingsInput`, `AdminLedgerQuery`, `AdminMetricsQuery`, `StudioOnboardInput`, `StudioPatchInput`, `IssueApiKeyInput`, `WebhookConfigInput`, `WebhookTestInput`.
- `packages/shared/src/apikey.ts` — `generateApiKey()`, `hashApiKey(raw)`, `apiKeyPrefix(raw)`, `verifyApiKey(raw, hashedKey)`.
- `packages/shared/src/settings.ts` — `PlatformSettings` read/write helpers over a `PlatformSetting` singleton row.
- `packages/shared/src/metrics.ts` — `computePlatformMetrics()` aggregation (GMV, fees, active studios, recent orders).
- `packages/shared/src/audit.ts` — `writeAudit(args)` helper (already exists from P1; extend with admin actions if missing).

**Database (`packages/db`)**
- `packages/db/prisma/schema.prisma` — add `PlatformSetting` singleton model (default fee, Stellar accounts, network) + migration.
- `packages/db/prisma/migrations/<ts>_phase7_platform_setting/migration.sql`.

**Admin endpoints (`apps/web/app/api/v1/admin`)**
- `apps/web/app/api/v1/admin/metrics/route.ts` — `GET`.
- `apps/web/app/api/v1/admin/ledger/route.ts` — `GET`.
- `apps/web/app/api/v1/admin/settings/route.ts` — `PATCH`.

**Studio endpoints (`apps/web/app/api/v1/studios`)**
- `apps/web/app/api/v1/studios/route.ts` — `GET` (admin list) / `POST` (admin onboard).
- `apps/web/app/api/v1/studios/[id]/route.ts` — `GET` / `PATCH` (admin or studio-self).
- `apps/web/app/api/v1/studios/[id]/api-keys/route.ts` — `POST` (issue once).
- `apps/web/app/api/v1/studios/[id]/api-keys/[keyId]/route.ts` — `DELETE` (revoke).
- `apps/web/app/api/v1/studios/[id]/webhook/route.ts` — `PATCH` (set URL SSRF-validated + rotate secret).
- `apps/web/app/api/v1/studios/[id]/webhooks/deliveries/route.ts` — `GET` (delivery log).
- `apps/web/app/api/v1/studios/[id]/webhooks/deliveries/[deliveryId]/retry/route.ts` — `POST` (manual retry → re-enqueue).
- `apps/web/app/api/v1/studios/[id]/webhooks/test/route.ts` — `POST` (signed test event; consume P3 builder if present).

**Admin pages (`apps/web/app/(admin)`)**
- `apps/web/app/(admin)/admin/page.tsx` — dashboard (GMV/fees/active studios/recent orders).
- `apps/web/app/(admin)/admin/studios/page.tsx` — list/approve/suspend + set fee.
- `apps/web/app/(admin)/admin/studios/[id]/page.tsx` — detail (keys, webhook, payout wallet).
- `apps/web/app/(admin)/admin/users/page.tsx` — platform/studio users.
- `apps/web/app/(admin)/admin/transactions/page.tsx` — global ledger.
- `apps/web/app/(admin)/admin/settings/page.tsx` — default fee + platform Stellar accounts + network.
- `apps/web/app/(admin)/admin/layout.tsx` — admin shell (top nav + left rail), gated server-side.

**Hardening / proxy / deploy / CI**
- `apps/web/proxy.ts` — confirm coarse `(admin)` gate + security headers/CSP (modify).
- `apps/web/lib/rateLimit.ts` — confirm coverage list (modify/verify).
- `railway.web.json` (or `railway.json` for web) and `railway.worker.json` — service configs.
- `.github/workflows/ci.yml` — wire Playwright demo e2e as headline gate + lint/tsc/test/audit/migrate-diff.

**Tests**
- `packages/shared/src/__tests__/apikey.test.ts`
- `packages/shared/src/__tests__/metrics.test.ts`
- `apps/web/app/api/v1/admin/__tests__/metrics.test.ts`
- `apps/web/app/api/v1/admin/__tests__/settings.test.ts`
- `apps/web/app/api/v1/studios/__tests__/apiKeys.test.ts`
- `apps/web/app/api/v1/studios/__tests__/webhook.test.ts`
- `apps/web/app/api/v1/studios/__tests__/webhookDeliveries.test.ts`
- `apps/web/e2e/demo.spec.ts` — existing Phase-3 e2e (wired into CI here).

---

## Task 1: PlatformSetting model + settings helpers

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<ts>_phase7_platform_setting/migration.sql`
- Create: `packages/shared/src/settings.ts`
- Create: `packages/shared/src/dto/admin.ts` (settings mapper portion)
- Create: `packages/shared/src/zod/admin.ts` (settings input portion)
- Test: `packages/shared/src/__tests__/settings.test.ts`

**Interfaces:**
- Consumes: `prisma` and `Prisma` from `@xgamefi/db`; `env` from `@xgamefi/config/env` (for bootstrap defaults `PLATFORM_FEE_BPS`, `STELLAR_NETWORK`, `STELLAR_RECEIVING_ACCOUNT`).
- Produces:
  - `getPlatformSettings(): Promise<PlatformSettings>` where `PlatformSettings = { id: string; defaultFeeBps: number; receivingAccount: string; payoutSignerPublic: string | null; usdAssetCode: string; usdAssetIssuer: string | null; network: "testnet"|"pubnet"; updatedAt: Date }`.
  - `updatePlatformSettings(patch: Partial<Pick<PlatformSettings,"defaultFeeBps"|"receivingAccount"|"payoutSignerPublic"|"usdAssetCode"|"usdAssetIssuer"|"network">>): Promise<PlatformSettings>`.
  - `toAdminSettingsDto(s: PlatformSettings): AdminSettingsDto` (same shape minus internal `id`).
  - `AdminSettingsInput` Zod schema: `{ defaultFeeBps?: number (int, 0..10000); receivingAccount?: string (G...); payoutSignerPublic?: string; usdAssetCode?: string; usdAssetIssuer?: string; network?: "testnet"|"pubnet" }`.

- [ ] **Step 1: Add the PlatformSetting model to schema**

In `packages/db/prisma/schema.prisma` add:

```prisma
model PlatformSetting {
  id                 String   @id @default("singleton")
  defaultFeeBps      Int      @default(500)
  receivingAccount   String
  payoutSignerPublic String?
  usdAssetCode       String   @default("USDT")
  usdAssetIssuer     String?
  network            String   @default("testnet")
  updatedAt          DateTime @updatedAt
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @xgamefi/db prisma migrate dev --name phase7_platform_setting`
Expected: a new migration directory under `packages/db/prisma/migrations/` containing the `CREATE TABLE "PlatformSetting"` statement; `prisma generate` regenerates the client.

- [ ] **Step 3: Write the failing settings helper test**

```ts
// packages/shared/src/__tests__/settings.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@xgamefi/db";
import { getPlatformSettings, updatePlatformSettings } from "../settings";

describe("platform settings", () => {
  beforeEach(async () => {
    await prisma.platformSetting.deleteMany();
  });

  it("bootstraps a singleton from env defaults when none exists", async () => {
    const s = await getPlatformSettings();
    expect(s.id).toBe("singleton");
    expect(s.defaultFeeBps).toBeTypeOf("number");
    expect(s.network).toMatch(/testnet|pubnet/);
  });

  it("updates only provided fields and bumps updatedAt", async () => {
    const before = await getPlatformSettings();
    const after = await updatePlatformSettings({ defaultFeeBps: 750 });
    expect(after.defaultFeeBps).toBe(750);
    expect(after.receivingAccount).toBe(before.receivingAccount);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test settings`
Expected: FAIL with "Cannot find module '../settings'".

- [ ] **Step 5: Implement settings helpers, DTO, and Zod schema**

```ts
// packages/shared/src/settings.ts
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";

export type PlatformSettings = {
  id: string;
  defaultFeeBps: number;
  receivingAccount: string;
  payoutSignerPublic: string | null;
  usdAssetCode: string;
  usdAssetIssuer: string | null;
  network: "testnet" | "pubnet";
  updatedAt: Date;
};

const SINGLETON = "singleton";

function toSettings(row: {
  id: string; defaultFeeBps: number; receivingAccount: string;
  payoutSignerPublic: string | null; usdAssetCode: string;
  usdAssetIssuer: string | null; network: string; updatedAt: Date;
}): PlatformSettings {
  return {
    id: row.id,
    defaultFeeBps: row.defaultFeeBps,
    receivingAccount: row.receivingAccount,
    payoutSignerPublic: row.payoutSignerPublic,
    usdAssetCode: row.usdAssetCode,
    usdAssetIssuer: row.usdAssetIssuer,
    network: row.network === "pubnet" ? "pubnet" : "testnet",
    updatedAt: row.updatedAt,
  };
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSetting.upsert({
    where: { id: SINGLETON },
    update: {},
    create: {
      id: SINGLETON,
      defaultFeeBps: env.PLATFORM_FEE_BPS,
      receivingAccount: env.STELLAR_RECEIVING_ACCOUNT,
      usdAssetCode: env.STELLAR_USD_ASSET_CODE,
      usdAssetIssuer: env.STELLAR_USD_ASSET_ISSUER ?? null,
      network: env.STELLAR_NETWORK,
    },
  });
  return toSettings(row);
}

export async function updatePlatformSettings(
  patch: Partial<Pick<PlatformSettings,
    "defaultFeeBps" | "receivingAccount" | "payoutSignerPublic" |
    "usdAssetCode" | "usdAssetIssuer" | "network">>,
): Promise<PlatformSettings> {
  await getPlatformSettings(); // ensure singleton exists
  const row = await prisma.platformSetting.update({
    where: { id: SINGLETON },
    data: patch,
  });
  return toSettings(row);
}
```

```ts
// packages/shared/src/dto/admin.ts
import type { PlatformSettings } from "../settings";

export type AdminSettingsDto = {
  defaultFeeBps: number;
  receivingAccount: string;
  payoutSignerPublic: string | null;
  usdAssetCode: string;
  usdAssetIssuer: string | null;
  network: "testnet" | "pubnet";
  updatedAt: string;
};

export function toAdminSettingsDto(s: PlatformSettings): AdminSettingsDto {
  return {
    defaultFeeBps: s.defaultFeeBps,
    receivingAccount: s.receivingAccount,
    payoutSignerPublic: s.payoutSignerPublic,
    usdAssetCode: s.usdAssetCode,
    usdAssetIssuer: s.usdAssetIssuer,
    network: s.network,
    updatedAt: s.updatedAt.toISOString(),
  };
}
```

```ts
// packages/shared/src/zod/admin.ts
import { z } from "zod";

const stellarAddress = z.string().regex(/^G[A-Z2-7]{55}$/, "invalid Stellar address");

export const AdminSettingsInput = z.object({
  defaultFeeBps: z.number().int().min(0).max(10000).optional(),
  receivingAccount: stellarAddress.optional(),
  payoutSignerPublic: stellarAddress.optional(),
  usdAssetCode: z.string().min(1).max(12).optional(),
  usdAssetIssuer: stellarAddress.optional(),
  network: z.enum(["testnet", "pubnet"]).optional(),
}).strict();
export type AdminSettingsInputT = z.infer<typeof AdminSettingsInput>;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test settings`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/shared/src/settings.ts packages/shared/src/dto/admin.ts packages/shared/src/zod/admin.ts packages/shared/src/__tests__/settings.test.ts
git commit -m "feat(admin): PlatformSetting singleton + settings helpers/DTO/zod

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: API key generate/hash/verify helpers

**Files:**
- Create: `packages/shared/src/apikey.ts`
- Create: `packages/shared/src/dto/studioKey.ts`
- Test: `packages/shared/src/__tests__/apikey.test.ts`

**Interfaces:**
- Consumes: Node `crypto` (`randomBytes`, `createHash`, `timingSafeEqual`).
- Produces:
  - `generateApiKey(): { raw: string; prefix: string; hashedKey: string }` — `raw` = `xgk_<base64url 32 bytes>`; `prefix` = first 12 chars of `raw`; `hashedKey` = sha256 hex of `raw`.
  - `hashApiKey(raw: string): string` — sha256 hex.
  - `apiKeyPrefix(raw: string): string` — first 12 chars.
  - `verifyApiKey(raw: string, hashedKey: string): boolean` — constant-time compare of `hashApiKey(raw)` vs stored.
  - `toApiKeyDto(row): ApiKeyDto` where `ApiKeyDto = { id: string; keyPrefix: string; scopes: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }` (NEVER includes raw/hashedKey).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/apikey.test.ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, apiKeyPrefix, verifyApiKey } from "../apikey";
import { toApiKeyDto } from "../dto/studioKey";

describe("api keys", () => {
  it("generates a prefixed raw key with matching prefix and hash", () => {
    const { raw, prefix, hashedKey } = generateApiKey();
    expect(raw.startsWith("xgk_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hashedKey).toBe(hashApiKey(raw));
    expect(prefix).toBe(apiKeyPrefix(raw));
  });

  it("verifies a key by hash (constant-time) and rejects a wrong key", () => {
    const { raw, hashedKey } = generateApiKey();
    expect(verifyApiKey(raw, hashedKey)).toBe(true);
    expect(verifyApiKey(raw + "x", hashedKey)).toBe(false);
    expect(verifyApiKey("xgk_wrong", hashedKey)).toBe(false);
  });

  it("the DTO never leaks the raw key or hashedKey", () => {
    const dto = toApiKeyDto({
      id: "k1", keyPrefix: "xgk_abcd1234", hashedKey: "deadbeef",
      scopes: ["ingest"], lastUsedAt: null, revokedAt: null, createdAt: new Date(0),
    });
    expect(JSON.stringify(dto)).not.toContain("deadbeef");
    expect((dto as Record<string, unknown>).hashedKey).toBeUndefined();
    expect(dto.keyPrefix).toBe("xgk_abcd1234");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test apikey`
Expected: FAIL with "Cannot find module '../apikey'".

- [ ] **Step 3: Implement the helpers and DTO**

```ts
// packages/shared/src/apikey.ts
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const PREFIX_LEN = 12;

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function apiKeyPrefix(raw: string): string {
  return raw.slice(0, PREFIX_LEN);
}

export function generateApiKey(): { raw: string; prefix: string; hashedKey: string } {
  const raw = "xgk_" + randomBytes(32).toString("base64url");
  return { raw, prefix: apiKeyPrefix(raw), hashedKey: hashApiKey(raw) };
}

export function verifyApiKey(raw: string, hashedKey: string): boolean {
  const a = Buffer.from(hashApiKey(raw), "hex");
  const b = Buffer.from(hashedKey, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

```ts
// packages/shared/src/dto/studioKey.ts
export type ApiKeyDto = {
  id: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function toApiKeyDto(row: {
  id: string; keyPrefix: string; scopes: string[];
  lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date;
}): ApiKeyDto {
  return {
    id: row.id,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test apikey`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/apikey.ts packages/shared/src/dto/studioKey.ts packages/shared/src/__tests__/apikey.test.ts
git commit -m "feat(admin): hashed api key generate/verify + leak-safe DTO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Platform metrics aggregation

**Files:**
- Create: `packages/shared/src/metrics.ts`
- Modify: `packages/shared/src/dto/admin.ts` (add metrics + ledger + studio + user mappers)
- Test: `packages/shared/src/__tests__/metrics.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Prisma` from `@xgamefi/db`; `toStellarAmount` from `@xgamefi/shared/money`.
- Produces:
  - `computePlatformMetrics(): Promise<PlatformMetrics>` where `PlatformMetrics = { gmv: Prisma.Decimal; feesCollected: Prisma.Decimal; activeStudios: number; recentOrders: RecentOrder[] }` and `RecentOrder = { id: string; studioId: string; itemName: string; grossAmount: Prisma.Decimal; currency: string; paymentStatus: string; deliveryStatus: string; createdAt: Date }`.
  - `toAdminMetricsDto(m: PlatformMetrics): AdminMetricsDto` — amounts as 7-dp strings.
  - `toAdminLedgerEntryDto(row): AdminLedgerEntryDto`.
  - `toAdminStudioDto(row): AdminStudioDto`.
  - `toAdminUserDto(row): AdminUserDto`.

GMV = sum of `Order.grossAmount` where `paymentStatus = PAID`. feesCollected = sum of `Order.platformFeeAmount` where `paymentStatus = PAID`. activeStudios = count of `Studio` where `status = ACTIVE`. recentOrders = latest 10 orders (any status) ordered by `createdAt desc`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/metrics.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, Prisma } from "@xgamefi/db";
import { computePlatformMetrics } from "../metrics";
import { toAdminMetricsDto } from "../dto/admin";

async function seedStudioWithItem() {
  const studio = await prisma.studio.create({
    data: { name: "S", slug: "s-" + Date.now(), status: "ACTIVE", platformFeeBps: 500 },
  });
  const item = await prisma.item.create({
    data: { studioId: studio.id, externalId: "i1", name: "Sword Skin",
      priceAmount: new Prisma.Decimal("1"), priceCurrency: "USDT", metadata: {} },
  });
  const player = await prisma.player.create({ data: { walletAddress: "G" + "A".repeat(55) } });
  return { studio, item, player };
}

describe("platform metrics", () => {
  beforeEach(async () => {
    await prisma.order.deleteMany();
    await prisma.item.deleteMany();
    await prisma.player.deleteMany();
    await prisma.studio.deleteMany();
  });

  it("sums GMV and fees only over PAID orders and counts active studios", async () => {
    const { studio, item, player } = await seedStudioWithItem();
    await prisma.order.create({ data: {
      studioId: studio.id, itemId: item.id, playerId: player.id, quantity: 1,
      currency: "USDT", grossAmount: new Prisma.Decimal("1"), discountAmount: new Prisma.Decimal("0"),
      platformFeeAmount: new Prisma.Decimal("0.05"), netToStudioAmount: new Prisma.Decimal("0.95"),
      idempotencyKey: "k-paid", paymentStatus: "PAID", deliveryStatus: "DELIVERED" } });
    await prisma.order.create({ data: {
      studioId: studio.id, itemId: item.id, playerId: player.id, quantity: 1,
      currency: "USDT", grossAmount: new Prisma.Decimal("9"), discountAmount: new Prisma.Decimal("0"),
      platformFeeAmount: new Prisma.Decimal("0.45"), netToStudioAmount: new Prisma.Decimal("8.55"),
      idempotencyKey: "k-pending", paymentStatus: "PENDING", deliveryStatus: "PENDING" } });

    const m = await computePlatformMetrics();
    expect(m.gmv.toString()).toBe("1");
    expect(m.feesCollected.toString()).toBe("0.05");
    expect(m.activeStudios).toBe(1);
    expect(m.recentOrders.length).toBe(2);

    const dto = toAdminMetricsDto(m);
    expect(dto.gmv).toBe("1.0000000");
    expect(dto.feesCollected).toBe("0.0500000");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test metrics`
Expected: FAIL with "Cannot find module '../metrics'".

- [ ] **Step 3: Implement metrics + DTO mappers**

```ts
// packages/shared/src/metrics.ts
import { prisma, Prisma } from "@xgamefi/db";

export type RecentOrder = {
  id: string; studioId: string; itemName: string;
  grossAmount: Prisma.Decimal; currency: string;
  paymentStatus: string; deliveryStatus: string; createdAt: Date;
};

export type PlatformMetrics = {
  gmv: Prisma.Decimal;
  feesCollected: Prisma.Decimal;
  activeStudios: number;
  recentOrders: RecentOrder[];
};

export async function computePlatformMetrics(): Promise<PlatformMetrics> {
  const [agg, activeStudios, orders] = await prisma.$transaction([
    prisma.order.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { grossAmount: true, platformFeeAmount: true },
    }),
    prisma.studio.count({ where: { status: "ACTIVE" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" }, take: 10,
      include: { item: { select: { name: true } } },
    }),
  ]);

  return {
    gmv: agg._sum.grossAmount ?? new Prisma.Decimal(0),
    feesCollected: agg._sum.platformFeeAmount ?? new Prisma.Decimal(0),
    activeStudios,
    recentOrders: orders.map((o) => ({
      id: o.id, studioId: o.studioId, itemName: o.item.name,
      grossAmount: o.grossAmount, currency: o.currency,
      paymentStatus: o.paymentStatus, deliveryStatus: o.deliveryStatus,
      createdAt: o.createdAt,
    })),
  };
}
```

Append to `packages/shared/src/dto/admin.ts`:

```ts
import { toStellarAmount } from "../money";
import type { PlatformMetrics } from "../metrics";

export type AdminMetricsDto = {
  gmv: string; feesCollected: string; activeStudios: number;
  recentOrders: {
    id: string; studioId: string; itemName: string; grossAmount: string;
    currency: string; paymentStatus: string; deliveryStatus: string; createdAt: string;
  }[];
};

export function toAdminMetricsDto(m: PlatformMetrics): AdminMetricsDto {
  return {
    gmv: toStellarAmount(m.gmv),
    feesCollected: toStellarAmount(m.feesCollected),
    activeStudios: m.activeStudios,
    recentOrders: m.recentOrders.map((o) => ({
      id: o.id, studioId: o.studioId, itemName: o.itemName,
      grossAmount: toStellarAmount(o.grossAmount), currency: o.currency,
      paymentStatus: o.paymentStatus, deliveryStatus: o.deliveryStatus,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

export type AdminLedgerEntryDto = {
  id: string; type: string; orderId: string | null; tradeId: string | null;
  referralId: string | null; stellarTxHash: string; sourceAddress: string;
  destAddress: string; amount: string; assetCode: string; assetIssuer: string | null;
  status: string; createdAt: string;
};

export function toAdminLedgerEntryDto(row: {
  id: string; type: string; orderId: string | null; tradeId: string | null;
  referralId: string | null; stellarTxHash: string; sourceAddress: string;
  destAddress: string; amount: { toString(): string }; assetCode: string;
  assetIssuer: string | null; status: string; createdAt: Date;
}): AdminLedgerEntryDto {
  return {
    id: row.id, type: row.type, orderId: row.orderId, tradeId: row.tradeId,
    referralId: row.referralId, stellarTxHash: row.stellarTxHash,
    sourceAddress: row.sourceAddress, destAddress: row.destAddress,
    amount: row.amount.toString(), assetCode: row.assetCode,
    assetIssuer: row.assetIssuer, status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export type AdminStudioDto = {
  id: string; name: string; slug: string; status: string;
  platformFeeBps: number; payoutWalletAddress: string | null;
  integrationMode: string; webhookUrl: string | null;
  apiBaseUrl: string | null; createdAt: string;
};

export function toAdminStudioDto(row: {
  id: string; name: string; slug: string; status: string; platformFeeBps: number;
  payoutWalletAddress: string | null; integrationMode: string;
  webhookUrl: string | null; apiBaseUrl: string | null; createdAt: Date;
}): AdminStudioDto {
  return {
    id: row.id, name: row.name, slug: row.slug, status: row.status,
    platformFeeBps: row.platformFeeBps, payoutWalletAddress: row.payoutWalletAddress,
    integrationMode: row.integrationMode, webhookUrl: row.webhookUrl,
    apiBaseUrl: row.apiBaseUrl, createdAt: row.createdAt.toISOString(),
  };
}

export type AdminUserDto = {
  id: string; username: string; role: string; studioId: string | null;
  isActive: boolean; lastLoginAt: string | null; createdAt: string;
};

export function toAdminUserDto(row: {
  id: string; username: string; role: string; studioId: string | null;
  isActive: boolean; lastLoginAt: Date | null; createdAt: Date;
}): AdminUserDto {
  return {
    id: row.id, username: row.username, role: row.role, studioId: row.studioId,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test metrics`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/metrics.ts packages/shared/src/dto/admin.ts packages/shared/src/__tests__/metrics.test.ts
git commit -m "feat(admin): platform metrics aggregation + admin DTO mappers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `GET /admin/metrics` (RBAC-gated, mapped DTO)

**Files:**
- Create: `apps/web/app/api/v1/admin/metrics/route.ts`
- Test: `apps/web/app/api/v1/admin/__tests__/metrics.test.ts`

**Interfaces:**
- Consumes: `requireRole` from `apps/web/lib/auth` (re-exports `@xgamefi/shared/auth`); `computePlatformMetrics`, `toAdminMetricsDto` from `@xgamefi/shared`.
- Produces: `GET` handler returning `200 { data: AdminMetricsDto }`; `403` (via thrown `requireRole`) for non-ADMIN. Test mocks `getPrincipal`/`requireRole`. Errors are mapped — never stack traces.

Note on auth test pattern (used in all endpoint tasks): `requireRole`/`requireStudio` are imported from `apps/web/lib/auth`; tests mock that module with `vi.mock("@/lib/auth", ...)`. A central `handleError(e)` helper maps thrown `HttpError` (with `.status`) to `Response.json({ error }, { status })`; assume it exists from P1 at `apps/web/lib/http.ts` exporting `handleError(e: unknown): Response` and `HttpError`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/admin/__tests__/metrics.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, computePlatformMetrics: vi.fn() };
});

import { GET } from "../../metrics/route";
import { computePlatformMetrics } from "@xgamefi/shared";
import { Prisma } from "@xgamefi/db";
import { HttpError } from "@/lib/http";

describe("GET /admin/metrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies a non-admin principal with 403", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await GET(new Request("http://x/api/v1/admin/metrics"));
    expect(res.status).toBe(403);
    expect(computePlatformMetrics).not.toHaveBeenCalled();
  });

  it("returns mapped metrics DTO for an admin", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    (computePlatformMetrics as any).mockResolvedValueOnce({
      gmv: new Prisma.Decimal("2"), feesCollected: new Prisma.Decimal("0.1"),
      activeStudios: 3, recentOrders: [],
    });
    const res = await GET(new Request("http://x/api/v1/admin/metrics"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gmv).toBe("2.0000000");
    expect(body.data.activeStudios).toBe(3);
    expect(requireRole).toHaveBeenCalledWith("ADMIN");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/metrics`
Expected: FAIL with "Cannot find module '../../metrics/route'".

- [ ] **Step 3: Implement the handler**

```ts
// apps/web/app/api/v1/admin/metrics/route.ts
import { requireRole } from "@/lib/auth";
import { computePlatformMetrics, toAdminMetricsDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const metrics = await computePlatformMetrics();
    return Response.json({ data: toAdminMetricsDto(metrics) });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/metrics`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/admin/metrics/route.ts apps/web/app/api/v1/admin/__tests__/metrics.test.ts
git commit -m "feat(admin): GET /admin/metrics RBAC-gated KPIs endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `GET /admin/ledger` (paginated global ledger feed)

**Files:**
- Create: `apps/web/app/api/v1/admin/ledger/route.ts`
- Modify: `packages/shared/src/zod/admin.ts` (add `AdminLedgerQuery`)
- Test: `apps/web/app/api/v1/admin/__tests__/ledger.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `toAdminLedgerEntryDto`, `AdminLedgerQuery` Zod.
- Produces: `GET` returning `200 { data: AdminLedgerEntryDto[]; nextCursor: string | null }`. Query params: `type?`, `studioId?`, `limit?` (1..100, default 50), `cursor?` (ledger id). Ordered `createdAt desc`. Non-admin → 403.

`AdminLedgerQuery = z.object({ type: z.string().optional(), studioId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().uuid().optional() }).strict()`.

- [ ] **Step 1: Add the Zod query schema**

Append to `packages/shared/src/zod/admin.ts`:

```ts
export const AdminLedgerQuery = z.object({
  type: z.string().optional(),
  studioId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
}).strict();
export type AdminLedgerQueryT = z.infer<typeof AdminLedgerQuery>;
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/app/api/v1/admin/__tests__/ledger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole }));

const findMany = vi.fn();
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { ledgerEntry: { findMany } } };
});

import { GET } from "../../ledger/route";
import { HttpError } from "@/lib/http";

describe("GET /admin/ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin with 403", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await GET(new Request("http://x/api/v1/admin/ledger"));
    expect(res.status).toBe(403);
  });

  it("returns mapped ledger entries with a nextCursor", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    findMany.mockResolvedValueOnce([{
      id: "11111111-1111-1111-1111-111111111111", type: "SALE_IN",
      orderId: null, tradeId: null, referralId: null, stellarTxHash: "abc",
      sourceAddress: "G1", destAddress: "G2", amount: { toString: () => "1.5" },
      assetCode: "USDT", assetIssuer: null, status: "ok", createdAt: new Date(0),
    }]);
    const res = await GET(new Request("http://x/api/v1/admin/ledger?limit=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].type).toBe("SALE_IN");
    expect(body.data[0].amount).toBe("1.5");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/ledger`
Expected: FAIL with "Cannot find module '../../ledger/route'".

- [ ] **Step 4: Implement the handler**

```ts
// apps/web/app/api/v1/admin/ledger/route.ts
import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { AdminLedgerQuery, toAdminLedgerEntryDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const url = new URL(req.url);
    const q = AdminLedgerQuery.parse(Object.fromEntries(url.searchParams));
    const rows = await prisma.ledgerEntry.findMany({
      where: {
        ...(q.type ? { type: q.type } : {}),
        ...(q.studioId
          ? { OR: [{ order: { studioId: q.studioId } }, { trade: { listing: { studioId: q.studioId } } }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return Response.json({
      data: page.map(toAdminLedgerEntryDto),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/ledger`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/v1/admin/ledger/route.ts packages/shared/src/zod/admin.ts apps/web/app/api/v1/admin/__tests__/ledger.test.ts
git commit -m "feat(admin): GET /admin/ledger paginated global ledger feed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `PATCH /admin/settings` (default fee + Stellar accounts + network, audited)

**Files:**
- Create: `apps/web/app/api/v1/admin/settings/route.ts`
- Test: `apps/web/app/api/v1/admin/__tests__/settings.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `AdminSettingsInput`, `updatePlatformSettings`, `getPlatformSettings`, `toAdminSettingsDto`, `writeAudit`; `getClientIp` from `apps/web/lib/http` (returns IP string from request headers).
- Produces: `GET` returning `{ data: AdminSettingsDto }`; `PATCH` validating body, updating, writing `AuditLog(action="platform.settings.update")`, returning updated DTO. Non-admin → 403. Invalid body → 400 (Zod).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/admin/__tests__/settings.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole }));

const updatePlatformSettings = vi.fn();
const getPlatformSettings = vi.fn();
const writeAudit = vi.fn();
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, updatePlatformSettings, getPlatformSettings, writeAudit };
});

import { PATCH } from "../../settings/route";
import { HttpError } from "@/lib/http";

function patchReq(body: unknown) {
  return new Request("http://x/api/v1/admin/settings", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /admin/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin with 403", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await PATCH(patchReq({ defaultFeeBps: 600 }));
    expect(res.status).toBe(403);
    expect(updatePlatformSettings).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range fee with 400", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    const res = await PATCH(patchReq({ defaultFeeBps: 99999 }));
    expect(res.status).toBe(400);
    expect(updatePlatformSettings).not.toHaveBeenCalled();
  });

  it("updates settings and writes an audit log entry", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    updatePlatformSettings.mockResolvedValueOnce({
      id: "singleton", defaultFeeBps: 600, receivingAccount: "G" + "A".repeat(55),
      payoutSignerPublic: null, usdAssetCode: "USDT", usdAssetIssuer: null,
      network: "testnet", updatedAt: new Date(0),
    });
    const res = await PATCH(patchReq({ defaultFeeBps: 600 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.defaultFeeBps).toBe(600);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform.settings.update", actorUserId: "u1",
    }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/settings`
Expected: FAIL with "Cannot find module '../../settings/route'".

- [ ] **Step 3: Implement the handler**

```ts
// apps/web/app/api/v1/admin/settings/route.ts
import { requireRole } from "@/lib/auth";
import {
  AdminSettingsInput, updatePlatformSettings, getPlatformSettings,
  toAdminSettingsDto, writeAudit,
} from "@xgamefi/shared";
import { handleError, getClientIp } from "@/lib/http";

export async function GET(): Promise<Response> {
  try {
    await requireRole("ADMIN");
    return Response.json({ data: toAdminSettingsDto(await getPlatformSettings()) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const principal = await requireRole("ADMIN");
    const patch = AdminSettingsInput.parse(await req.json());
    const updated = await updatePlatformSettings(patch);
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "platform.settings.update",
      entityType: "PlatformSetting", entityId: updated.id,
      metadata: { changed: Object.keys(patch) },
      ip: getClientIp(req),
    });
    return Response.json({ data: toAdminSettingsDto(updated) });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/settings`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/admin/settings/route.ts apps/web/app/api/v1/admin/__tests__/settings.test.ts
git commit -m "feat(admin): PATCH /admin/settings with audit logging

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `GET/POST /studios` (admin list + onboard) and `GET/PATCH /studios/:id`

**Files:**
- Create: `apps/web/app/api/v1/studios/route.ts`
- Create: `apps/web/app/api/v1/studios/[id]/route.ts`
- Modify: `packages/shared/src/zod/admin.ts` (add `StudioOnboardInput`, `StudioPatchInput`)
- Test: `apps/web/app/api/v1/studios/__tests__/studios.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `requireStudio`, `scopeToStudio`, `prisma`, `toAdminStudioDto`, `getPlatformSettings`, `writeAudit`, `assertPublicUrl` (only when `apiBaseUrl` provided on PATCH), Zod schemas.
- Produces:
  - `GET /studios` (admin) → `{ data: AdminStudioDto[] }`.
  - `POST /studios` (admin) → create studio with `status="PENDING"`, `platformFeeBps` defaulting to platform default, slug uniqueness enforced; audit `studio.onboard`; `201 { data }`.
  - `GET /studios/:id` (admin or studio-self via `requireStudio`) → `{ data }`.
  - `PATCH /studios/:id` (admin or studio-self) → update profile/branding/payoutWallet/fee (fee only by ADMIN)/integrationMode; if `apiBaseUrl` set, validate via `assertPublicUrl`; admin-only status transitions ACTIVE/SUSPENDED; audit `studio.update` / `studio.approve` / `studio.suspend`.

`StudioOnboardInput = z.object({ name: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().optional(), payoutWalletAddress: z.string().regex(/^G[A-Z2-7]{55}$/).optional(), integrationMode: z.enum(["API_PULL","WEBHOOK_PUSH"]).default("API_PULL"), apiBaseUrl: z.string().url().optional() }).strict()`

`StudioPatchInput = z.object({ name: z.string().min(1).optional(), description: z.string().optional(), brand: z.record(z.any()).optional(), payoutWalletAddress: z.string().regex(/^G[A-Z2-7]{55}$/).optional(), platformFeeBps: z.number().int().min(0).max(10000).optional(), integrationMode: z.enum(["API_PULL","WEBHOOK_PUSH"]).optional(), apiBaseUrl: z.string().url().optional(), status: z.enum(["ACTIVE","SUSPENDED","PENDING"]).optional() }).strict()`

- [ ] **Step 1: Add Zod schemas**

Append `StudioOnboardInput` and `StudioPatchInput` (exactly as in Interfaces above) to `packages/shared/src/zod/admin.ts`, importing `z` (already imported).

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/app/api/v1/studios/__tests__/studios.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole, requireStudio, scopeToStudio }));

const studioCreate = vi.fn();
const studioFindMany = vi.fn();
const studioFindUnique = vi.fn();
const studioUpdate = vi.fn();
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { studio: {
    create: studioCreate, findMany: studioFindMany,
    findUnique: studioFindUnique, update: studioUpdate } } };
});

const writeAudit = vi.fn();
const getPlatformSettings = vi.fn().mockResolvedValue({ defaultFeeBps: 500 });
const assertPublicUrl = vi.fn();
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, writeAudit, getPlatformSettings, assertPublicUrl };
});

import { GET as listStudios, POST as onboardStudio } from "../../route";
import { PATCH as patchStudio } from "../../[id]/route";
import { HttpError } from "@/lib/http";

const studioRow = {
  id: "s1", name: "Gridlock", slug: "gridlock", status: "PENDING",
  platformFeeBps: 500, payoutWalletAddress: null, integrationMode: "API_PULL",
  webhookUrl: null, apiBaseUrl: null, createdAt: new Date(0),
};

describe("studios admin endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /studios rejects non-admin", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await listStudios(new Request("http://x/api/v1/studios"));
    expect(res.status).toBe(403);
  });

  it("POST /studios onboards with default fee and audits", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    studioCreate.mockResolvedValueOnce(studioRow);
    const res = await onboardStudio(new Request("http://x/api/v1/studios", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Gridlock", slug: "gridlock" }),
    }));
    expect(res.status).toBe(201);
    expect(studioCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ platformFeeBps: 500, status: "PENDING" }),
    }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "studio.onboard" }));
  });

  it("PATCH /studios/:id SUSPEND requires ADMIN and audits suspend", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    studioFindUnique.mockResolvedValueOnce(studioRow);
    studioUpdate.mockResolvedValueOnce({ ...studioRow, status: "SUSPENDED" });
    const res = await patchStudio(
      new Request("http://x/api/v1/studios/s1", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED" }),
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(200);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "studio.suspend" }));
  });

  it("PATCH /studios/:id rejects a non-admin trying to change platformFeeBps", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u2", studioId: "s1" });
    studioFindUnique.mockResolvedValueOnce(studioRow);
    const res = await patchStudio(
      new Request("http://x/api/v1/studios/s1", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ platformFeeBps: 100 }),
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(403);
    expect(studioUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/studios`
Expected: FAIL with "Cannot find module '../../route'".

- [ ] **Step 4: Implement both route files**

```ts
// apps/web/app/api/v1/studios/route.ts
import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import {
  StudioOnboardInput, toAdminStudioDto, getPlatformSettings,
  writeAudit, assertPublicUrl,
} from "@xgamefi/shared";
import { handleError, getClientIp } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const rows = await prisma.studio.findMany({ orderBy: { createdAt: "desc" } });
    return Response.json({ data: rows.map(toAdminStudioDto) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const principal = await requireRole("ADMIN");
    const input = StudioOnboardInput.parse(await req.json());
    if (input.apiBaseUrl) await assertPublicUrl(input.apiBaseUrl);
    const settings = await getPlatformSettings();
    const created = await prisma.studio.create({
      data: {
        name: input.name, slug: input.slug, description: input.description,
        payoutWalletAddress: input.payoutWalletAddress,
        integrationMode: input.integrationMode, apiBaseUrl: input.apiBaseUrl,
        platformFeeBps: settings.defaultFeeBps, status: "PENDING",
      },
    });
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "studio.onboard", entityType: "Studio", entityId: created.id,
      metadata: { slug: created.slug }, ip: getClientIp(req),
    });
    return Response.json({ data: toAdminStudioDto(created) }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
```

```ts
// apps/web/app/api/v1/studios/[id]/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import {
  StudioPatchInput, toAdminStudioDto, writeAudit, assertPublicUrl,
} from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    await requireStudio(id);
    const row = await prisma.studio.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "studio not found");
    return Response.json({ data: toAdminStudioDto(row) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const isAdmin = principal.kind === "user" && principal.role === "ADMIN";
    const patch = StudioPatchInput.parse(await req.json());

    if ((patch.platformFeeBps !== undefined || patch.status !== undefined) && !isAdmin) {
      throw new HttpError(403, "only an admin may change fee or status");
    }
    const existing = await prisma.studio.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "studio not found");
    if (patch.apiBaseUrl) await assertPublicUrl(patch.apiBaseUrl);

    const updated = await prisma.studio.update({ where: { id }, data: patch });

    let action = "studio.update";
    if (patch.status === "ACTIVE") action = "studio.approve";
    else if (patch.status === "SUSPENDED") action = "studio.suspend";
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action, entityType: "Studio", entityId: id,
      metadata: { changed: Object.keys(patch) }, ip: getClientIp(req),
    });
    return Response.json({ data: toAdminStudioDto(updated) });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/studios`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/v1/studios/route.ts apps/web/app/api/v1/studios/[id]/route.ts packages/shared/src/zod/admin.ts apps/web/app/api/v1/studios/__tests__/studios.test.ts
git commit -m "feat(admin): studio list/onboard + detail/patch with audit + SSRF check

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: API key issue (once) + revoke

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/api-keys/route.ts`
- Create: `apps/web/app/api/v1/studios/[id]/api-keys/[keyId]/route.ts`
- Modify: `packages/shared/src/zod/admin.ts` (add `IssueApiKeyInput`)
- Test: `apps/web/app/api/v1/studios/__tests__/apiKeys.test.ts`

**Interfaces:**
- Consumes: `requireStudio`, `prisma`, `generateApiKey`, `toApiKeyDto`, `writeAudit`, `IssueApiKeyInput` Zod.
- Produces:
  - `POST /studios/:id/api-keys` → store `{ keyPrefix, hashedKey, scopes }`, return `201 { data: { ...ApiKeyDto, key: rawKey } }` — `key` present ONLY on this response; audit `apikey.issue`.
  - `DELETE /studios/:id/api-keys/:keyId` → set `revokedAt = now`, audit `apikey.revoke`, return `200 { data: ApiKeyDto }`. 404 if key not in this studio.

`IssueApiKeyInput = z.object({ scopes: z.array(z.string()).default(["ingest"]) }).strict()`

- [ ] **Step 1: Add the Zod schema**

Append `IssueApiKeyInput` (as above) to `packages/shared/src/zod/admin.ts`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/app/api/v1/studios/__tests__/apiKeys.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireStudio = vi.fn();
vi.mock("@/lib/auth", () => ({ requireStudio }));

const apiKeyCreate = vi.fn();
const apiKeyFindFirst = vi.fn();
const apiKeyUpdate = vi.fn();
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { apiKey: {
    create: apiKeyCreate, findFirst: apiKeyFindFirst, update: apiKeyUpdate } } };
});

const writeAudit = vi.fn();
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, writeAudit };
});

import { POST as issueKey } from "../../[id]/api-keys/route";
import { DELETE as revokeKey } from "../../[id]/api-keys/[keyId]/route";

describe("api key endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues a key, returns the raw key ONCE, and persists only the hash", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    apiKeyCreate.mockImplementationOnce(async ({ data }: any) => ({
      id: "k1", keyPrefix: data.keyPrefix, scopes: data.scopes,
      lastUsedAt: null, revokedAt: null, createdAt: new Date(0),
    }));
    const res = await issueKey(
      new Request("http://x/api/v1/studios/s1/api-keys", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.data.key).toBe("string");
    expect(body.data.key.startsWith("xgk_")).toBe(true);
    // persisted record carries hashedKey, not the raw key
    const persisted = apiKeyCreate.mock.calls[0][0].data;
    expect(persisted.hashedKey).toBeTypeOf("string");
    expect(persisted.hashedKey).not.toBe(body.data.key);
    expect(persisted).not.toHaveProperty("rawKey");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "apikey.issue" }));
  });

  it("revokes a key belonging to the studio and audits", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    apiKeyFindFirst.mockResolvedValueOnce({ id: "k1", studioId: "s1" });
    apiKeyUpdate.mockResolvedValueOnce({
      id: "k1", keyPrefix: "xgk_abc", scopes: ["ingest"],
      lastUsedAt: null, revokedAt: new Date(0), createdAt: new Date(0),
    });
    const res = await revokeKey(
      new Request("http://x/api/v1/studios/s1/api-keys/k1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "s1", keyId: "k1" }) },
    );
    expect(res.status).toBe(200);
    expect(apiKeyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "k1" }, data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "apikey.revoke" }));
  });

  it("returns 404 revoking a key not in this studio", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    apiKeyFindFirst.mockResolvedValueOnce(null);
    const res = await revokeKey(
      new Request("http://x/api/v1/studios/s1/api-keys/kX", { method: "DELETE" }),
      { params: Promise.resolve({ id: "s1", keyId: "kX" }) },
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/apiKeys`
Expected: FAIL with "Cannot find module '../../[id]/api-keys/route'".

- [ ] **Step 4: Implement both handlers**

```ts
// apps/web/app/api/v1/studios/[id]/api-keys/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { generateApiKey, toApiKeyDto, writeAudit, IssueApiKeyInput } from "@xgamefi/shared";
import { handleError, getClientIp } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const input = IssueApiKeyInput.parse(await req.json().catch(() => ({})));
    const { raw, prefix, hashedKey } = generateApiKey();
    const row = await prisma.apiKey.create({
      data: { studioId: id, keyPrefix: prefix, hashedKey, scopes: input.scopes },
    });
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "apikey.issue", entityType: "ApiKey", entityId: row.id,
      metadata: { studioId: id, keyPrefix: prefix }, ip: getClientIp(req),
    });
    // raw `key` is returned ONCE here and never again.
    return Response.json({ data: { ...toApiKeyDto(row), key: raw } }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
```

```ts
// apps/web/app/api/v1/studios/[id]/api-keys/[keyId]/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { toApiKeyDto, writeAudit } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; keyId: string }> };

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id, keyId } = await params;
    const principal = await requireStudio(id);
    const existing = await prisma.apiKey.findFirst({ where: { id: keyId, studioId: id } });
    if (!existing) throw new HttpError(404, "api key not found");
    const row = await prisma.apiKey.update({
      where: { id: keyId }, data: { revokedAt: new Date() },
    });
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "apikey.revoke", entityType: "ApiKey", entityId: keyId,
      metadata: { studioId: id }, ip: getClientIp(req),
    });
    return Response.json({ data: toApiKeyDto(row) });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/apiKeys`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/v1/studios/[id]/api-keys" packages/shared/src/zod/admin.ts apps/web/app/api/v1/studios/__tests__/apiKeys.test.ts
git commit -m "feat(studios): issue-once hashed API keys + revoke, audited

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `PATCH /studios/:id/webhook` (SSRF-validated URL + rotate secret)

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/webhook/route.ts`
- Modify: `packages/shared/src/zod/admin.ts` (add `WebhookConfigInput`)
- Test: `apps/web/app/api/v1/studios/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: `requireStudio`, `prisma`, `assertPublicUrl`, `generateApiKey` (reused to mint a secret) OR a dedicated `generateWebhookSecret()`; for clarity add `generateWebhookSecret(): { raw: string; hash: string }` to `packages/shared/src/apikey.ts`; `hashApiKey`; `writeAudit`; `WebhookConfigInput` Zod.
- Produces: `PATCH /studios/:id/webhook` → validates `{ url }` via `assertPublicUrl` (throws → mapped 400), rotates secret (`webhookSecretHash` stored, raw secret returned ONCE), persists `webhookUrl`; audit `webhook.config`. Returns `200 { data: { webhookUrl, secret: rawSecret } }`.

`WebhookConfigInput = z.object({ url: z.string().url() }).strict()`

- [ ] **Step 1: Add `generateWebhookSecret` to apikey.ts and the Zod schema**

Append to `packages/shared/src/apikey.ts`:

```ts
export function generateWebhookSecret(): { raw: string; hash: string } {
  const raw = "whsec_" + randomBytes(32).toString("base64url");
  return { raw, hash: hashApiKey(raw) };
}
```

Append `WebhookConfigInput` (as above) to `packages/shared/src/zod/admin.ts`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/app/api/v1/studios/__tests__/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireStudio = vi.fn();
vi.mock("@/lib/auth", () => ({ requireStudio }));

const studioUpdate = vi.fn();
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { studio: { update: studioUpdate } } };
});

const assertPublicUrl = vi.fn();
const writeAudit = vi.fn();
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, assertPublicUrl, writeAudit };
});

import { PATCH as setWebhook } from "../../[id]/webhook/route";

function req(body: unknown) {
  return new Request("http://x/api/v1/studios/s1/webhook", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /studios/:id/webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an SSRF-failing URL with 400 and does not persist", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    assertPublicUrl.mockRejectedValueOnce(new Error("blocked: private/metadata range"));
    const res = await setWebhook(req({ url: "https://169.254.169.254/" }),
      { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
    expect(studioUpdate).not.toHaveBeenCalled();
  });

  it("sets a validated URL, rotates the secret, returns it once, stores only the hash", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    assertPublicUrl.mockResolvedValueOnce(new URL("https://hooks.gridlock.gg/x"));
    studioUpdate.mockImplementationOnce(async ({ data }: any) => ({
      id: "s1", webhookUrl: data.webhookUrl, webhookSecretHash: data.webhookSecretHash }));
    const res = await setWebhook(req({ url: "https://hooks.gridlock.gg/x" }),
      { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.webhookUrl).toBe("https://hooks.gridlock.gg/x");
    expect(typeof body.data.secret).toBe("string");
    expect(body.data.secret.startsWith("whsec_")).toBe(true);
    const persisted = studioUpdate.mock.calls[0][0].data;
    expect(persisted.webhookSecretHash).not.toBe(body.data.secret);
    expect(persisted).not.toHaveProperty("webhookSecret");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "webhook.config" }));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/webhook`
Expected: FAIL with "Cannot find module '../../[id]/webhook/route'".

- [ ] **Step 4: Implement the handler**

```ts
// apps/web/app/api/v1/studios/[id]/webhook/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { assertPublicUrl, generateWebhookSecret, writeAudit, WebhookConfigInput } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const { url } = WebhookConfigInput.parse(await req.json());
    try {
      await assertPublicUrl(url);
    } catch {
      throw new HttpError(400, "webhook URL failed SSRF validation");
    }
    const secret = generateWebhookSecret();
    const updated = await prisma.studio.update({
      where: { id },
      data: { webhookUrl: url, webhookSecretHash: secret.hash },
    });
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "webhook.config", entityType: "Studio", entityId: id,
      metadata: { rotatedSecret: true }, ip: getClientIp(req),
    });
    // raw secret returned ONCE here.
    return Response.json({ data: { webhookUrl: updated.webhookUrl, secret: secret.raw } });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/webhook`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/v1/studios/[id]/webhook" packages/shared/src/apikey.ts packages/shared/src/zod/admin.ts apps/web/app/api/v1/studios/__tests__/webhook.test.ts
git commit -m "feat(studios): SSRF-validated webhook URL + secret rotation, audited

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Webhook delivery log + manual retry (re-enqueue) + signed test

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/webhooks/deliveries/route.ts`
- Create: `apps/web/app/api/v1/studios/[id]/webhooks/deliveries/[deliveryId]/retry/route.ts`
- Create: `apps/web/app/api/v1/studios/[id]/webhooks/test/route.ts`
- Create: `packages/shared/src/dto/webhookDelivery.ts`
- Modify: `packages/shared/src/zod/admin.ts` (add `WebhookTestInput`)
- Test: `apps/web/app/api/v1/studios/__tests__/webhookDeliveries.test.ts`

**Interfaces:**
- Consumes: `requireStudio`, `prisma`, `getQueue` from `@xgamefi/shared/queues` (queue name `"webhook-delivery"`), `toWebhookDeliveryDto`, `writeAudit`, `signWebhook` (from `@xgamefi/shared/hmac`) + `generateWebhookSecret`/stored secret for test events, `WebhookTestInput` Zod.
- Produces:
  - `GET /studios/:id/webhooks/deliveries` → `{ data: WebhookDeliveryDto[]; nextCursor }` ordered `createdAt desc`, scoped to studio.
  - `POST /studios/:id/webhooks/deliveries/:deliveryId/retry` → reset delivery to `PENDING`, `attempt=0`, `nextAttemptAt=now`, then `getQueue("webhook-delivery").add("deliver", { deliveryId })`; audit `webhook.retry`; `202 { data: WebhookDeliveryDto }`. 404 if not in studio. 409 if status already `DELIVERED`.
  - `POST /studios/:id/webhooks/test` → create a `WebhookDelivery` row (`event="purchase.completed"`, synthetic payload) and enqueue it (consuming the P3 builder if present); `202 { data: WebhookDeliveryDto }`.
  - `toWebhookDeliveryDto(row): WebhookDeliveryDto = { id, event, orderId, tradeId, url, status, attempt, maxAttempts, responseStatus, nextAttemptAt, createdAt, deliveredAt }` (no signature/secret leaked).

`WebhookTestInput = z.object({ event: z.enum(["purchase.completed","purchase.pending","purchase.failed","p2p.trade.completed"]).default("purchase.completed") }).strict()`

- [ ] **Step 1: Implement the delivery DTO and Zod schema**

```ts
// packages/shared/src/dto/webhookDelivery.ts
export type WebhookDeliveryDto = {
  id: string; event: string; orderId: string | null; tradeId: string | null;
  url: string; status: string; attempt: number; maxAttempts: number;
  responseStatus: number | null; nextAttemptAt: string | null;
  createdAt: string; deliveredAt: string | null;
};

export function toWebhookDeliveryDto(row: {
  id: string; event: string; orderId: string | null; tradeId: string | null;
  url: string; status: string; attempt: number; maxAttempts: number;
  responseStatus: number | null; nextAttemptAt: Date | null;
  createdAt: Date; deliveredAt: Date | null;
}): WebhookDeliveryDto {
  return {
    id: row.id, event: row.event, orderId: row.orderId, tradeId: row.tradeId,
    url: row.url, status: row.status, attempt: row.attempt, maxAttempts: row.maxAttempts,
    responseStatus: row.responseStatus,
    nextAttemptAt: row.nextAttemptAt ? row.nextAttemptAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  };
}
```

Append `WebhookTestInput` (as above) to `packages/shared/src/zod/admin.ts`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/app/api/v1/studios/__tests__/webhookDeliveries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireStudio = vi.fn();
vi.mock("@/lib/auth", () => ({ requireStudio }));

const deliveryFindMany = vi.fn();
const deliveryFindFirst = vi.fn();
const deliveryUpdate = vi.fn();
const deliveryCreate = vi.fn();
const studioFindUnique = vi.fn();
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: {
    webhookDelivery: { findMany: deliveryFindMany, findFirst: deliveryFindFirst,
      update: deliveryUpdate, create: deliveryCreate },
    studio: { findUnique: studioFindUnique } } };
});

const queueAdd = vi.fn();
const getQueue = vi.fn(() => ({ add: queueAdd }));
const writeAudit = vi.fn();
vi.mock("@xgamefi/shared", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getQueue, writeAudit };
});

import { GET as listDeliveries } from "../../[id]/webhooks/deliveries/route";
import { POST as retryDelivery } from "../../[id]/webhooks/deliveries/[deliveryId]/retry/route";

const delivery = {
  id: "d1", studioId: "s1", event: "purchase.completed", orderId: "o1", tradeId: null,
  url: "https://hooks.gridlock.gg/x", status: "EXHAUSTED", attempt: 5, maxAttempts: 5,
  responseStatus: 500, nextAttemptAt: null, createdAt: new Date(0), deliveredAt: null,
};

describe("webhook delivery ops", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists deliveries scoped to the studio", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    deliveryFindMany.mockResolvedValueOnce([delivery]);
    const res = await listDeliveries(new Request("http://x/api/v1/studios/s1/webhooks/deliveries"),
      { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe("d1");
    expect(deliveryFindMany.mock.calls[0][0].where.studioId).toBe("s1");
  });

  it("manual retry re-enqueues the webhook-delivery job and resets state", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    deliveryFindFirst.mockResolvedValueOnce(delivery);
    deliveryUpdate.mockResolvedValueOnce({ ...delivery, status: "PENDING", attempt: 0 });
    const res = await retryDelivery(
      new Request("http://x/api/v1/studios/s1/webhooks/deliveries/d1/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "s1", deliveryId: "d1" }) });
    expect(res.status).toBe(202);
    expect(getQueue).toHaveBeenCalledWith("webhook-delivery");
    expect(queueAdd).toHaveBeenCalledWith("deliver", { deliveryId: "d1" });
    expect(deliveryUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", attempt: 0 }),
    }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "webhook.retry" }));
  });

  it("rejects retry of an already-DELIVERED delivery with 409", async () => {
    requireStudio.mockResolvedValueOnce({ kind: "user", role: "STUDIO_OWNER", userId: "u1", studioId: "s1" });
    deliveryFindFirst.mockResolvedValueOnce({ ...delivery, status: "DELIVERED" });
    const res = await retryDelivery(
      new Request("http://x/api/v1/studios/s1/webhooks/deliveries/d1/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "s1", deliveryId: "d1" }) });
    expect(res.status).toBe(409);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/webhookDeliveries`
Expected: FAIL with "Cannot find module '../../[id]/webhooks/deliveries/route'".

- [ ] **Step 4: Implement the three handlers**

```ts
// apps/web/app/api/v1/studios/[id]/webhooks/deliveries/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { toWebhookDeliveryDto, AdminLedgerQuery } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    await requireStudio(id);
    const url = new URL(req.url);
    // reuse limit/cursor coercion from AdminLedgerQuery (limit 1..100 default 50)
    const q = AdminLedgerQuery.pick({ limit: true, cursor: true }).parse(
      Object.fromEntries(url.searchParams));
    const rows = await prisma.webhookDelivery.findMany({
      where: { studioId: id },
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return Response.json({
      data: page.map(toWebhookDeliveryDto),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
```

```ts
// apps/web/app/api/v1/studios/[id]/webhooks/deliveries/[deliveryId]/retry/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { getQueue, toWebhookDeliveryDto, writeAudit } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; deliveryId: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id, deliveryId } = await params;
    const principal = await requireStudio(id);
    const existing = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, studioId: id },
    });
    if (!existing) throw new HttpError(404, "delivery not found");
    if (existing.status === "DELIVERED") throw new HttpError(409, "already delivered");

    const updated = await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "PENDING", attempt: 0, nextAttemptAt: new Date(), responseStatus: null },
    });
    await getQueue("webhook-delivery").add("deliver", { deliveryId });
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "webhook.retry", entityType: "WebhookDelivery", entityId: deliveryId,
      metadata: { studioId: id }, ip: getClientIp(req),
    });
    return Response.json({ data: toWebhookDeliveryDto(updated) }, { status: 202 });
  } catch (e) {
    return handleError(e);
  }
}
```

```ts
// apps/web/app/api/v1/studios/[id]/webhooks/test/route.ts
import { requireStudio } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { getQueue, toWebhookDeliveryDto, writeAudit, WebhookTestInput } from "@xgamefi/shared";
import { handleError, getClientIp, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const principal = await requireStudio(id);
    const { event } = WebhookTestInput.parse(await req.json().catch(() => ({})));
    const studio = await prisma.studio.findUnique({ where: { id } });
    if (!studio?.webhookUrl) throw new HttpError(409, "studio has no webhook URL configured");

    const payload = {
      id: `evt_test_${Date.now()}`, event, createdAt: new Date().toISOString(),
      data: { test: true, studioId: id },
    };
    const created = await prisma.webhookDelivery.create({
      data: {
        studioId: id, event, url: studio.webhookUrl, payload, signature: "",
        attempt: 0, maxAttempts: 1, status: "PENDING", nextAttemptAt: new Date(),
      },
    });
    // signing + actual POST happen inside the webhook-delivery worker (P3), reused here.
    await getQueue("webhook-delivery").add("deliver", { deliveryId: created.id });
    await writeAudit({
      actorType: "user",
      actorUserId: principal.kind === "user" ? principal.userId : null,
      action: "webhook.test", entityType: "WebhookDelivery", entityId: created.id,
      metadata: { studioId: id, event }, ip: getClientIp(req),
    });
    return Response.json({ data: toWebhookDeliveryDto(created) }, { status: 202 });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test studios/__tests__/webhookDeliveries`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/v1/studios/[id]/webhooks" packages/shared/src/dto/webhookDelivery.ts packages/shared/src/zod/admin.ts apps/web/app/api/v1/studios/__tests__/webhookDeliveries.test.ts
git commit -m "feat(studios): webhook delivery log + manual retry re-enqueue + signed test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `GET /admin/users` (admin list) + admin users data

**Files:**
- Create: `apps/web/app/api/v1/admin/users/route.ts`
- Test: `apps/web/app/api/v1/admin/__tests__/users.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma`, `toAdminUserDto`.
- Produces: `GET /admin/users` → `{ data: AdminUserDto[] }` (all users, ordered `createdAt desc`); non-admin → 403. DTO never includes `passwordHash`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/admin/__tests__/users.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole }));

const userFindMany = vi.fn();
vi.mock("@xgamefi/db", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, prisma: { user: { findMany: userFindMany } } };
});

import { GET } from "../../users/route";
import { HttpError } from "@/lib/http";

describe("GET /admin/users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admin", async () => {
    requireRole.mockRejectedValueOnce(new HttpError(403, "forbidden"));
    const res = await GET(new Request("http://x/api/v1/admin/users"));
    expect(res.status).toBe(403);
  });

  it("returns users without leaking passwordHash", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    userFindMany.mockResolvedValueOnce([{
      id: "u2", username: "studio1", role: "STUDIO_OWNER", studioId: "s1",
      isActive: true, lastLoginAt: null, createdAt: new Date(0),
    }]);
    const res = await GET(new Request("http://x/api/v1/admin/users"));
    const body = await res.json();
    expect(body.data[0].username).toBe("studio1");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/users`
Expected: FAIL with "Cannot find module '../../users/route'".

- [ ] **Step 3: Implement the handler**

```ts
// apps/web/app/api/v1/admin/users/route.ts
import { requireRole } from "@/lib/auth";
import { prisma } from "@xgamefi/db";
import { toAdminUserDto } from "@xgamefi/shared";
import { handleError } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    await requireRole("ADMIN");
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, username: true, role: true, studioId: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
    return Response.json({ data: rows.map(toAdminUserDto) });
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test admin/__tests__/users`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/admin/users/route.ts apps/web/app/api/v1/admin/__tests__/users.test.ts
git commit -m "feat(admin): GET /admin/users (no passwordHash leak)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Admin console pages (layout + 6 pages, RBAC-gated server-side, BRAND.md)

**Files:**
- Create: `apps/web/app/(admin)/admin/layout.tsx`
- Create: `apps/web/app/(admin)/admin/page.tsx`
- Create: `apps/web/app/(admin)/admin/studios/page.tsx`
- Create: `apps/web/app/(admin)/admin/studios/[id]/page.tsx`
- Create: `apps/web/app/(admin)/admin/users/page.tsx`
- Create: `apps/web/app/(admin)/admin/transactions/page.tsx`
- Create: `apps/web/app/(admin)/admin/settings/page.tsx`
- Test: `apps/web/app/(admin)/admin/__tests__/adminGate.test.ts`

**Interfaces:**
- Consumes: `getPrincipal`/`requireRole` from `@/lib/auth`; data helpers `computePlatformMetrics`, `getPlatformSettings`, `prisma`, DTO mappers directly (Server Components call the shared functions, not the HTTP API).
- Produces: Server Components rendering admin data. `layout.tsx` calls `requireRole("ADMIN")` server-side and redirects to `/login` on failure (defense in depth on top of `proxy.ts`).

BRAND.md styling: dark obsidian (`bg-background`), fixed top nav (`h-20 border-b-2 border-primary`), `w-64` left rail (active item `bg-primary text-on-primary border-l-4 border-secondary`); stat blocks `surface-container` with values in `text-primary-fixed`; mono uppercase labels (`font-mono` + `tracking-[0.1em]`); item/ledger rows as a vertical list with accent amounts; respect `prefers-reduced-motion` for any pulse/glow.

- [ ] **Step 1: Write the failing gate test**

```ts
// apps/web/app/(admin)/admin/__tests__/adminGate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
const redirect = vi.fn((url: string) => { throw new Error("REDIRECT:" + url); });
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("next/navigation", () => ({ redirect }));

import AdminLayout from "../layout";

describe("admin layout gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /login when the principal is not an admin", async () => {
    requireRole.mockRejectedValueOnce(new Error("forbidden"));
    await expect(AdminLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("renders children for an admin principal", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    const out = await AdminLayout({ children: "OK" });
    expect(out).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test "admin/__tests__/adminGate"`
Expected: FAIL with "Cannot find module '../layout'".

- [ ] **Step 3: Implement the layout (gate) and the six pages**

```tsx
// apps/web/app/(admin)/admin/layout.tsx
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/admin", label: "OVERVIEW" },
  { href: "/admin/studios", label: "STUDIOS" },
  { href: "/admin/users", label: "USERS" },
  { href: "/admin/transactions", label: "LEDGER" },
  { href: "/admin/settings", label: "SETTINGS" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireRole("ADMIN");
  } catch {
    redirect("/login");
  }
  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="h-20 border-b-2 border-primary flex items-center px-16">
        <span className="font-display italic text-2xl">xGameFi</span>
        <span className="ml-4 font-mono text-xs tracking-[0.1em] text-on-surface-variant">ADMIN CONSOLE</span>
      </header>
      <div className="flex">
        <nav className="w-64 border-r-2 border-outline-variant min-h-[calc(100vh-5rem)] py-6">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className="block px-6 py-3 font-mono text-xs tracking-[0.1em] hover:text-primary-fixed">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 px-16 py-8">{children}</main>
      </div>
    </div>
  );
}
```

```tsx
// apps/web/app/(admin)/admin/page.tsx
import { computePlatformMetrics, toAdminMetricsDto } from "@xgamefi/shared";

export default async function AdminOverview() {
  const dto = toAdminMetricsDto(await computePlatformMetrics());
  const stats = [
    { label: "GMV", value: dto.gmv },
    { label: "FEES COLLECTED", value: dto.feesCollected },
    { label: "ACTIVE STUDIOS", value: String(dto.activeStudios) },
  ];
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Overview</h1>
      <div className="grid grid-cols-3 gap-4 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-container p-6 border-2 border-outline-variant">
            <div className="font-mono text-xs tracking-[0.1em] text-on-surface-variant">{s.label}</div>
            <div className="font-display text-3xl text-primary-fixed mt-2">{s.value}</div>
          </div>
        ))}
      </div>
      <h2 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant mb-3">RECENT ORDERS</h2>
      <ul className="divide-y divide-outline-variant">
        {dto.recentOrders.map((o) => (
          <li key={o.id} className="flex justify-between py-3 font-mono text-sm">
            <span>#{o.id.slice(0, 8)} · {o.itemName}</span>
            <span className="text-primary-fixed">{o.grossAmount} {o.currency} · {o.paymentStatus}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
// apps/web/app/(admin)/admin/studios/page.tsx
import { prisma } from "@xgamefi/db";
import { toAdminStudioDto } from "@xgamefi/shared";
import Link from "next/link";

export default async function AdminStudios() {
  const rows = (await prisma.studio.findMany({ orderBy: { createdAt: "desc" } })).map(toAdminStudioDto);
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Studios</h1>
      <table className="w-full text-sm">
        <thead className="font-mono text-xs tracking-[0.1em] text-on-surface-variant text-left">
          <tr><th className="py-2">NAME</th><th>SLUG</th><th>STATUS</th><th>FEE BPS</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-outline-variant">
              <td className="py-3">
                <Link href={`/admin/studios/${s.id}`} className="hover:text-primary-fixed">{s.name}</Link>
              </td>
              <td className="font-mono">{s.slug}</td>
              <td className="font-mono text-primary-fixed">{s.status}</td>
              <td className="font-mono">{s.platformFeeBps}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-mono text-xs text-on-surface-variant mt-4">
        Use approve/suspend and set-fee via PATCH /studios/:id (admin-only fields).
      </p>
    </section>
  );
}
```

```tsx
// apps/web/app/(admin)/admin/studios/[id]/page.tsx
import { prisma } from "@xgamefi/db";
import { toAdminStudioDto, toApiKeyDto } from "@xgamefi/shared";
import { notFound } from "next/navigation";

export default async function AdminStudioDetail(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await prisma.studio.findUnique({
    where: { id }, include: { apiKeys: true },
  });
  if (!row) notFound();
  const studio = toAdminStudioDto(row);
  const keys = row.apiKeys.map(toApiKeyDto);
  return (
    <section>
      <h1 className="font-display text-4xl mb-6">{studio.name}</h1>
      <dl className="grid grid-cols-2 gap-3 font-mono text-sm mb-8">
        <dt className="text-on-surface-variant">PAYOUT WALLET</dt><dd>{studio.payoutWalletAddress ?? "—"}</dd>
        <dt className="text-on-surface-variant">WEBHOOK URL</dt><dd>{studio.webhookUrl ?? "—"}</dd>
        <dt className="text-on-surface-variant">INTEGRATION</dt><dd>{studio.integrationMode}</dd>
        <dt className="text-on-surface-variant">FEE BPS</dt><dd className="text-primary-fixed">{studio.platformFeeBps}</dd>
      </dl>
      <h2 className="font-mono text-xs tracking-[0.1em] text-on-surface-variant mb-3">API KEYS</h2>
      <ul className="divide-y divide-outline-variant font-mono text-sm">
        {keys.map((k) => (
          <li key={k.id} className="py-2 flex justify-between">
            <span>{k.keyPrefix}…</span>
            <span className={k.revokedAt ? "text-error" : "text-primary-fixed"}>
              {k.revokedAt ? "REVOKED" : "ACTIVE"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
// apps/web/app/(admin)/admin/users/page.tsx
import { prisma } from "@xgamefi/db";
import { toAdminUserDto } from "@xgamefi/shared";

export default async function AdminUsers() {
  const rows = (await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, username: true, role: true, studioId: true,
      isActive: true, lastLoginAt: true, createdAt: true },
  })).map(toAdminUserDto);
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Users</h1>
      <table className="w-full text-sm">
        <thead className="font-mono text-xs tracking-[0.1em] text-on-surface-variant text-left">
          <tr><th className="py-2">USERNAME</th><th>ROLE</th><th>STUDIO</th><th>ACTIVE</th></tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-outline-variant">
              <td className="py-3 font-mono">{u.username}</td>
              <td className="font-mono text-primary-fixed">{u.role}</td>
              <td className="font-mono">{u.studioId ?? "—"}</td>
              <td className="font-mono">{u.isActive ? "YES" : "NO"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

```tsx
// apps/web/app/(admin)/admin/transactions/page.tsx
import { prisma } from "@xgamefi/db";
import { toAdminLedgerEntryDto } from "@xgamefi/shared";

export default async function AdminTransactions() {
  const rows = (await prisma.ledgerEntry.findMany({
    orderBy: { createdAt: "desc" }, take: 50,
  })).map(toAdminLedgerEntryDto);
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Global Ledger</h1>
      <ul className="divide-y divide-outline-variant font-mono text-sm">
        {rows.map((l) => (
          <li key={l.id} className="flex justify-between py-3">
            <span>{l.type} · {l.stellarTxHash.slice(0, 10)}…</span>
            <span className="text-primary-fixed">{l.amount} {l.assetCode}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
// apps/web/app/(admin)/admin/settings/page.tsx
import { getPlatformSettings, toAdminSettingsDto } from "@xgamefi/shared";

export default async function AdminSettings() {
  const s = toAdminSettingsDto(await getPlatformSettings());
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Platform Settings</h1>
      <dl className="grid grid-cols-2 gap-3 font-mono text-sm max-w-2xl">
        <dt className="text-on-surface-variant">DEFAULT FEE BPS</dt>
        <dd className="text-primary-fixed">{s.defaultFeeBps}</dd>
        <dt className="text-on-surface-variant">NETWORK</dt><dd>{s.network}</dd>
        <dt className="text-on-surface-variant">RECEIVING ACCOUNT</dt><dd>{s.receivingAccount}</dd>
        <dt className="text-on-surface-variant">USD ASSET</dt>
        <dd>{s.usdAssetCode} {s.usdAssetIssuer ? `· ${s.usdAssetIssuer.slice(0, 8)}…` : ""}</dd>
      </dl>
      <p className="font-mono text-xs text-on-surface-variant mt-6">
        Edit via PATCH /api/v1/admin/settings (changes are audit-logged).
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test "admin/__tests__/adminGate"`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify pages typecheck**

Run: `pnpm --filter @xgamefi/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(admin)"
git commit -m "feat(admin): admin console pages (overview/studios/users/ledger/settings) gated server-side

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Hardening — rate-limit coverage, security headers/CSP, proxy admin gate

**Files:**
- Modify: `apps/web/proxy.ts`
- Modify: `apps/web/lib/rateLimit.ts`
- Test: `apps/web/lib/__tests__/rateLimitCoverage.test.ts`
- Test: `apps/web/__tests__/securityHeaders.test.ts`

**Interfaces:**
- Consumes: `rateLimit(key, { limit, windowSec })` from `apps/web/lib/rateLimit.ts` (exists from P1); env.
- Produces:
  - `RATE_LIMITED_PATHS` exported constant listing the path prefixes that MUST carry a rate limit: `/api/v1/auth/login`, `/api/v1/auth/wallet/challenge`, `/api/v1/auth/wallet/verify`, `/api/v1/checkout/quote`, `/api/v1/checkout/submit`, `/api/v1/p2p/listings`.
  - `securityHeaders(): Record<string,string>` from `apps/web/proxy.ts` (or `apps/web/lib/securityHeaders.ts`) returning CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.

- [ ] **Step 1: Write the failing rate-limit coverage test**

```ts
// apps/web/lib/__tests__/rateLimitCoverage.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RATE_LIMITED_PATHS } from "../rateLimit";

// Each listed path must have a route handler that imports the rateLimit helper.
const ROUTE_OF: Record<string, string> = {
  "/api/v1/auth/login": "app/api/v1/auth/login/route.ts",
  "/api/v1/auth/wallet/challenge": "app/api/v1/auth/wallet/challenge/route.ts",
  "/api/v1/auth/wallet/verify": "app/api/v1/auth/wallet/verify/route.ts",
  "/api/v1/checkout/quote": "app/api/v1/checkout/quote/route.ts",
  "/api/v1/checkout/submit": "app/api/v1/checkout/submit/route.ts",
  "/api/v1/p2p/listings": "app/api/v1/p2p/listings/route.ts",
};

describe("rate-limit coverage", () => {
  it("lists exactly the auth/checkout/listing paths", () => {
    expect(new Set(RATE_LIMITED_PATHS)).toEqual(new Set(Object.keys(ROUTE_OF)));
  });

  it("each rate-limited route imports the rateLimit helper", () => {
    const webRoot = join(__dirname, "..", "..");
    for (const [, rel] of Object.entries(ROUTE_OF)) {
      const file = join(webRoot, rel);
      expect(existsSync(file), `${rel} missing`).toBe(true);
      expect(readFileSync(file, "utf8")).toContain("rateLimit");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test rateLimitCoverage`
Expected: FAIL — `RATE_LIMITED_PATHS` not exported, or a route is missing the `rateLimit` import.

- [ ] **Step 3: Export the coverage list and ensure each route calls rateLimit**

Add to `apps/web/lib/rateLimit.ts`:

```ts
export const RATE_LIMITED_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/wallet/challenge",
  "/api/v1/auth/wallet/verify",
  "/api/v1/checkout/quote",
  "/api/v1/checkout/submit",
  "/api/v1/p2p/listings",
] as const;
```

For any listed route handler that does not yet call `rateLimit`, add at the top of the handler (example for login; apply the same pattern, adjusting `limit`/`windowSec`, to any route the test flags):

```ts
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp, HttpError } from "@/lib/http";
// inside the handler, before processing:
const ip = getClientIp(req);
if (!(await rateLimit(`login:${ip}`, { limit: 5, windowSec: 60 }))) {
  throw new HttpError(429, "too many requests");
}
```

- [ ] **Step 4: Write the failing security-headers test**

```ts
// apps/web/__tests__/securityHeaders.test.ts
import { describe, it, expect } from "vitest";
import { securityHeaders } from "../proxy";

describe("security headers", () => {
  it("sets CSP, HSTS, nosniff, referrer policy, frame-ancestors none", () => {
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @xgamefi/web test securityHeaders`
Expected: FAIL — `securityHeaders` not exported from `proxy.ts`.

- [ ] **Step 6: Implement `securityHeaders` + apply in proxy, keep admin coarse gate**

In `apps/web/proxy.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(securityHeaders())) res.headers.set(k, v);
  // Coarse admin gate (defense in depth — handlers/layout re-check ADMIN).
  if (req.nextUrl.pathname.startsWith("/admin") && !req.cookies.get("xg_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = { matcher: ["/admin/:path*", "/api/:path*"] };
```

- [ ] **Step 7: Run both hardening tests to verify they pass**

Run: `pnpm --filter @xgamefi/web test rateLimitCoverage securityHeaders`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/proxy.ts apps/web/lib/rateLimit.ts apps/web/lib/__tests__/rateLimitCoverage.test.ts apps/web/__tests__/securityHeaders.test.ts apps/web/app/api/v1
git commit -m "chore(security): rate-limit coverage list + CSP/HSTS headers + admin coarse gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Railway deploy config (web + worker, migrate-deploy-safe release step)

**Files:**
- Create: `railway.web.json`
- Create: `railway.worker.json`
- Test: `__tests__/railwayConfig.test.ts` (root-level, run by Vitest)

**Interfaces:**
- Consumes: nothing at runtime; these are deploy descriptors.
- Produces: two Railway service configs. Web release step runs `prisma migrate deploy && prisma generate` (NEVER `db:seed`); both have health checks; build with `--frozen-lockfile`.

- [ ] **Step 1: Write the failing config test**

```ts
// __tests__/railwayConfig.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function load(name: string) {
  return JSON.parse(readFileSync(join(__dirname, "..", name), "utf8"));
}

describe("railway configs", () => {
  it("web runs migrate deploy + generate in the release step and never seeds", () => {
    const web = load("railway.web.json");
    const release = web.deploy.preDeployCommand ?? web.deploy.releaseCommand ?? "";
    expect(release).toContain("prisma migrate deploy");
    expect(release).toContain("prisma generate");
    expect(release).not.toContain("db:seed");
    expect(web.deploy.startCommand).toContain("web");
    expect(web.deploy.healthcheckPath).toBe("/api/health");
  });

  it("worker config has a start command and no seed", () => {
    const worker = load("railway.worker.json");
    expect(worker.deploy.startCommand).toContain("worker");
    const release = worker.deploy.preDeployCommand ?? worker.deploy.releaseCommand ?? "";
    expect(release).not.toContain("db:seed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run __tests__/railwayConfig.test.ts`
Expected: FAIL — config files do not exist.

- [ ] **Step 3: Create the two config files**

```json
// railway.web.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter @xgamefi/db prisma generate && pnpm --filter web build"
  },
  "deploy": {
    "preDeployCommand": "pnpm --filter @xgamefi/db prisma migrate deploy && pnpm --filter @xgamefi/db prisma generate",
    "startCommand": "pnpm --filter web start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "numReplicas": 1
  }
}
```

```json
// railway.worker.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter @xgamefi/db prisma generate && pnpm --filter worker build"
  },
  "deploy": {
    "startCommand": "pnpm --filter worker start",
    "restartPolicyType": "ON_FAILURE",
    "numReplicas": 1
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run __tests__/railwayConfig.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add railway.web.json railway.worker.json __tests__/railwayConfig.test.ts
git commit -m "ops(railway): web + worker service configs with migrate-deploy release step

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: Wire Playwright demo e2e into CI as the headline gate

**Files:**
- Modify (or create): `.github/workflows/ci.yml`
- Verify exists: `apps/web/e2e/demo.spec.ts` (from Phase 3)

**Interfaces:**
- Consumes: existing Phase-3 Playwright demo spec; pnpm scripts `lint`, `typecheck` (`tsc --noEmit`), `test`, `e2e`; `prisma migrate diff` drift check; `pnpm audit`.
- Produces: a CI workflow with services (Postgres 17, Redis 7), running lint → tsc → unit test → migrate-diff → audit → **Playwright demo e2e** as the final required gate. All steps gate the merge.

- [ ] **Step 1: Confirm the Phase-3 demo spec exists**

Run: `test -f apps/web/e2e/demo.spec.ts && echo FOUND || echo MISSING`
Expected: `FOUND`. If `MISSING`, stop — Phase 3 was not completed; the e2e gate cannot be wired until it exists (note this as a dependency gap, do not fabricate the spec).

- [ ] **Step 2: Write the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_USER: user, POSTGRES_PASSWORD: pass, POSTGRES_DB: xgamefi }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U user" --health-interval 5s
          --health-timeout 5s --health-retries 10
      redis:
        image: redis:7
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://user:pass@localhost:5432/xgamefi
      SHADOW_DATABASE_URL: postgresql://user:pass@localhost:5432/xgamefi_shadow
      REDIS_URL: redis://localhost:6379
      SESSION_SECRET: test-session-secret-min-32-bytes-long-x
      STELLAR_NETWORK: testnet
      STELLAR_HORIZON_URL: https://horizon-testnet.stellar.org
      STELLAR_RPC_URL: https://soroban-testnet.stellar.org
      STELLAR_RECEIVING_ACCOUNT: GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5
      STELLAR_PAYOUT_SIGNER_SECRET: SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQT
      STELLAR_USD_ASSET_CODE: USDT
      STELLAR_USD_ASSET_ISSUER: GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5
      PLATFORM_FEE_BPS: "500"
      WEBHOOK_MAX_ATTEMPTS: "5"
      WEBHOOK_TIMESTAMP_TOLERANCE_SEC: "300"
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: ci-admin-password
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @xgamefi/db prisma migrate deploy
      - run: pnpm --filter @xgamefi/db prisma generate
      - run: pnpm lint
      - run: pnpm exec tsc --noEmit
      - run: pnpm test
      - name: Migration drift check
        run: pnpm --filter @xgamefi/db prisma migrate diff
          --from-migrations packages/db/prisma/migrations
          --to-schema-datamodel packages/db/prisma/schema.prisma
          --exit-code
      - name: Security audit
        run: pnpm audit --audit-level high
      - name: Seed demo data (CI only)
        run: pnpm --filter @xgamefi/db db:seed
      - name: Install Playwright browsers
        run: pnpm --filter web exec playwright install --with-deps chromium
      - name: Demo e2e (headline gate)
        run: pnpm --filter web exec playwright test e2e/demo.spec.ts
```

- [ ] **Step 3: Validate the workflow YAML parses**

Run: `pnpm dlx js-yaml .github/workflows/ci.yml > /dev/null && echo OK`
Expected: `OK` (valid YAML). If `js-yaml` unavailable, run `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: wire Playwright demo e2e as headline gate + lint/tsc/test/audit/migrate-diff

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: Full-suite green + AuditLog coverage assertion

**Files:**
- Test: `apps/web/app/api/v1/__tests__/auditCoverage.test.ts`

**Interfaces:**
- Consumes: the route handler source files created in Tasks 6–10.
- Produces: a guard test asserting every sensitive admin/studio handler writes an audit entry, and a final whole-suite run.

- [ ] **Step 1: Write the audit-coverage guard test**

```ts
// apps/web/app/api/v1/__tests__/auditCoverage.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = join(__dirname, "..");
const SENSITIVE: Array<[string, string]> = [
  ["admin/settings/route.ts", "platform.settings.update"],
  ["studios/route.ts", "studio.onboard"],
  ["studios/[id]/route.ts", "studio.update"],
  ["studios/[id]/api-keys/route.ts", "apikey.issue"],
  ["studios/[id]/api-keys/[keyId]/route.ts", "apikey.revoke"],
  ["studios/[id]/webhook/route.ts", "webhook.config"],
  ["studios/[id]/webhooks/deliveries/[deliveryId]/retry/route.ts", "webhook.retry"],
  ["studios/[id]/webhooks/test/route.ts", "webhook.test"],
];

describe("audit-log coverage on sensitive actions", () => {
  it.each(SENSITIVE)("%s writes audit action %s", (rel, action) => {
    const src = readFileSync(join(API, rel), "utf8");
    expect(src).toContain("writeAudit");
    expect(src).toContain(action);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter @xgamefi/web test auditCoverage`
Expected: PASS (8 cases) — each sensitive handler from Tasks 6–10 references `writeAudit` and its action string.

- [ ] **Step 3: Run the whole suite + typecheck + lint**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/v1/__tests__/auditCoverage.test.ts
git commit -m "test: assert audit-log coverage across sensitive admin/studio handlers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

Admin pages (SPEC §6 admin):
- `/admin` overview (GMV/fees/active studios/recent orders) — Task 12 page + Task 4 metrics. ✓
- `/admin/studios` list/approve/suspend + set fee — Task 12 page + Task 7 PATCH (admin-only fee/status). ✓
- `/admin/studios/[id]` detail (keys, webhook, payout wallet) — Task 12 page (includes apiKeys), data from Task 7. ✓
- `/admin/users` — Task 11 endpoint + Task 12 page. ✓
- `/admin/transactions` global ledger — Task 5 endpoint + Task 12 page. ✓
- `/admin/settings` default fee + Stellar accounts + network — Task 1 + Task 6 + Task 12 page. ✓

Admin endpoints (SPEC §7 admin&ops): `GET /admin/metrics` (Task 4), `GET /admin/ledger` (Task 5), `PATCH /admin/settings` (Task 6). ✓

Studio endpoints (SPEC §7 studios/keys/webhooks): `GET/POST /studios` (Task 7), `GET/PATCH /studios/:id` admin-or-self (Task 7), `POST /studios/:id/api-keys` issue-once hashed (Task 8), `DELETE …/api-keys/:keyId` revoke (Task 8), `PATCH …/webhook` SSRF-validated + rotate secret (Task 9). ✓

Webhook ops (SPEC §7): `GET …/webhooks/deliveries` (Task 10), `POST …/deliveries/:deliveryId/retry` re-enqueue (Task 10), `POST …/webhooks/test` signed test (Task 10, consumes P3 worker). ✓

Hardening (AGENT §10/§11/§14): rate-limit coverage list + per-route (Task 13), security headers/CSP (Task 13), audit coverage (Tasks 6–10 + Task 16 guard), Railway web+worker configs with `migrate deploy && generate` release step, no auto-seed (Task 14), health check wired (`/api/health` in Task 14 config), testnet/pubnet separation (PlatformSetting.network Task 1 + env), CI gating lint/tsc/test/audit/migrate-diff + Playwright demo e2e headline gate (Task 15). ✓

Demo acceptance (SPEC §13): the §13 e2e is the Phase-3 spec; Task 15 wires it as the headline CI gate (does not re-author it — correct per phase boundary). ✓

DoD (AGENT §14): Zod inputs + mapped DTOs (every endpoint), authZ in handler not just proxy (requireRole/requireStudio in each), studioId scoping (requireStudio/scopeToStudio), Decimal money (metrics via Prisma.Decimal + toStellarAmount), SSRF on webhook URL (Task 9), no secrets leaked (issue-once key/secret, DTO leak tests), migrations migrate-deploy-safe (Task 1 additive + Task 14 release step). ✓

**2. Placeholder scan**

No "TBD/TODO/implement later". Every code step shows complete code; every test step shows real assertions; every command has expected output. No "similar to Task N" — code is repeated where needed. Task 15 Step 1 deliberately checks for the pre-existing Phase-3 spec rather than fabricating it (correct: it is a prior-phase artifact, and the plan flags it as a gap if absent). ✓

**3. Type consistency**

- `requireRole("ADMIN")` / `requireStudio(id)` / `scopeToStudio` signatures match the canonical-interfaces contract exactly. ✓
- `assertPublicUrl(rawUrl): Promise<URL>` used in Tasks 7 & 9 matches the P0 SSRF contract. ✓
- `getQueue("webhook-delivery")` matches the P0 queues contract (`getQueue(name)`); queue name matches the SPEC §9 `webhook-delivery` queue. ✓
- `toStellarAmount(v: Prisma.Decimal): string` (7 dp) used in metrics DTO matches P0 money contract; test asserts `"1.0000000"`. ✓
- DTO mapper names are consistent across producer (Task 1/3) and consumers (Tasks 4/5/7/11/12): `toAdminMetricsDto`, `toAdminLedgerEntryDto`, `toAdminSettingsDto`, `toAdminStudioDto`, `toAdminUserDto`, `toApiKeyDto`, `toWebhookDeliveryDto`. ✓
- `generateApiKey()` returns `{ raw, prefix, hashedKey }` (Task 2), consumed in Task 8 destructuring the same names; `generateWebhookSecret()` returns `{ raw, hash }` (Task 9) consumed as `secret.raw`/`secret.hash`. ✓
- `HttpError`/`handleError`/`getClientIp` from `@/lib/http` assumed from P1 (noted in Task 4); used consistently. ✓
- `writeAudit(args)` arg shape (`actorType, actorUserId, action, entityType, entityId, metadata, ip`) consistent across all sensitive handlers and asserted by Task 16. ✓
- `AdminLedgerQuery.pick({ limit: true, cursor: true })` reuse in Task 10 is valid given the schema defined in Task 5. ✓

No inconsistencies found.

**Gaps noted:**
- Task 15 depends on `apps/web/e2e/demo.spec.ts` existing from Phase 3 and on pnpm root scripts `lint`/`test` plus `db:seed`; if the demo spec is absent, the e2e gate cannot be wired (Step 1 stops and flags it rather than fabricating). This is the only external dependency.
- `apps/web/lib/http.ts` (`HttpError`, `handleError`, `getClientIp`) and `apps/web/lib/rateLimit.ts` (`rateLimit`) are assumed delivered by Phases 1–3; if any helper is missing, add a tiny shim before the consuming task (not expected, per phase assumptions).
