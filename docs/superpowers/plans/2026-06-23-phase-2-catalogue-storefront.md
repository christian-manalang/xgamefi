# Phase 2 — Catalogue & Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `Item` catalogue (pull via `catalogue-sync` and push via `/ingest/items`) and render the read-only branded storefront — the studio items dashboard plus the public `/s/[slug]` grid and item detail — so `/s/gridlock` shows the seeded Sword Skin.

**Architecture:** Catalogue ingestion has two modes that converge on one shared upsert: a `catalogue-sync` BullMQ worker pulls `apiBaseUrl/items` through the SSRF guard, and a signed `POST /ingest/items` handler pushes the same shape. Read endpoints (`/studios/:id/items`, `/items/:id`, `/shops/:slug`, `/shops/:slug/items`) return mapped DTOs only and feed Server-Component pages styled per BRAND.md, with per-studio brand overrides layered over the Neon Overdrive skeleton.

**Tech Stack:** Next.js 16.2.x (App Router, Server Components), React 19.2.x, Tailwind v4.3.x (`@theme`), Prisma 7 (`@xgamefi/db`), BullMQ + ioredis (`apps/worker`), Zod, vitest. Phases 0–1 are complete: workspace, db + seed, `@xgamefi/shared` (money/hmac/ssrf/stellar/dto/zod), auth helpers + RBAC (`requireStudio`/`scopeToStudio`/`getPrincipal`), and the queue registry stubs (`getQueue`/`registerWorker`) already exist.

## Global Constraints

- Pinned versions: `next` 16.2.x, `react`/`react-dom` 19.2.x, `tailwindcss` 4.3.x — do not bump majors.
- SSRF guard on `apiBaseUrl`: every outbound call to a studio URL goes through `@xgamefi/shared/ssrf` `safeFetch` — no raw `fetch` to studio URLs anywhere.
- HMAC verify inbound `/ingest/*`: API key (`X-XGameFi-Key`) hashed lookup + `verifyHmac` over `timestamp + "." + rawBody`, ±5 min skew, constant-time compare.
- Mapped DTOs never raw rows: handlers return `toItemDto`/`toShopDto` output, never raw Prisma rows or stack traces.
- `studioId` scoping: every studio-scoped query passes through `scopeToStudio(principal, studioId)` before touching the DB.
- Server Components default; client islands narrow — only interactive bits (filter/search controls, item modal) are `"use client"`.
- BRAND token rules: obsidian (`#131313`) dominant, acid-lime (`primary-fixed` `#c3f400`) scarce (prices/CTAs/active only), mono uppercase labels with `0.1em` tracking (`label-technical`), sharp clipped corners (no rounding), 2px technical borders; per-studio brand overrides the wordmark/colors over this skeleton; gate scanlines/glitch/marquee/pulse behind `prefers-reduced-motion: reduce`.

---

## File Structure

**`packages/shared` (DTO + Zod + sync core):**
- `packages/shared/src/dto/item.ts` — `ItemDto`, `toItemDto(row)`.
- `packages/shared/src/dto/shop.ts` — `ShopDto`, `toShopDto(row)`.
- `packages/shared/src/dto/index.ts` — re-export (DTO barrel, may already exist; extend).
- `packages/shared/src/zod/catalogue.ts` — `IngestItemsInput`, `ItemOverrideInput`, `ShopItemsQuery`, `RemoteItem` parser.
- `packages/shared/src/catalogue/upsert.ts` — `upsertCatalogueItems(studioId, items)` shared by pull + push.
- `packages/shared/src/catalogue/fetch-remote.ts` — `fetchRemoteItems(apiBaseUrl)` (uses `safeFetch`).
- Tests: `packages/shared/src/dto/item.test.ts`, `shop.test.ts`, `packages/shared/src/zod/catalogue.test.ts`, `packages/shared/src/catalogue/upsert.test.ts`, `fetch-remote.test.ts`.

**`apps/worker` (catalogue-sync job):**
- `apps/worker/src/jobs/catalogue-sync.ts` — `catalogueSyncProcessor`, `CatalogueSyncJobData`.
- `apps/worker/src/jobs/catalogue-sync.test.ts`.
- Modify: `apps/worker/src/index.ts` — register worker.

**`apps/web` (route handlers):**
- `apps/web/app/api/v1/ingest/items/route.ts` — `POST` push handler.
- `apps/web/app/api/v1/studios/[id]/items/route.ts` — `GET` list.
- `apps/web/app/api/v1/studios/[id]/items/sync/route.ts` — `POST` enqueue.
- `apps/web/app/api/v1/studios/[id]/items/[itemId]/route.ts` — `PATCH` overrides.
- `apps/web/app/api/v1/items/[id]/route.ts` — `GET` public item.
- `apps/web/app/api/v1/studios/[id]/shop/route.ts` — `GET` config (studio).
- `apps/web/app/api/v1/shops/[slug]/route.ts` — `GET` published config (public).
- `apps/web/app/api/v1/shops/[slug]/items/route.ts` — `GET` filter/search/paginate (public).
- Tests: colocated `route.test.ts` for each handler under the same folder.

**`apps/web` (lib helpers):**
- `apps/web/lib/ingest-auth.ts` — `authenticateIngest(req, rawBody)` → `{ studioId }` or throws.
- `apps/web/lib/catalogue-queries.ts` — server-side read helpers (`getStudioItems`, `getPublishedShop`, `getShopItems`, `getPublicItem`) returning DTOs.
- Tests: `apps/web/lib/ingest-auth.test.ts`, `apps/web/lib/catalogue-queries.test.ts`.

**`apps/web` (pages + components):**
- `apps/web/app/(studio)/dashboard/items/page.tsx` — studio items dashboard.
- `apps/web/app/(studio)/dashboard/_components/item-row.tsx` — item card/row.
- `apps/web/app/(storefront)/s/[slug]/layout.tsx` — applies per-studio brand overrides.
- `apps/web/app/(storefront)/s/[slug]/page.tsx` — grid + filter/search/featured.
- `apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx` — detail page.
- `apps/web/app/(storefront)/s/[slug]/_components/item-card.tsx` — storefront item card.
- `apps/web/app/(storefront)/s/[slug]/_components/storefront-filters.tsx` — `"use client"` filter/search island.
- `apps/web/app/(storefront)/s/[slug]/_components/item-modal.tsx` — `"use client"` detail modal.
- `apps/web/app/(storefront)/s/[slug]/brand.ts` — `brandToCssVars(brand)` override helper.
- Tests: `apps/web/app/(storefront)/s/[slug]/storefront.test.tsx` (render smoke for `/s/gridlock`), `apps/web/app/(storefront)/s/[slug]/brand.test.ts`.

**Deferred to Phase 4 (NOT tasks here):** `PUT /studios/:id/shop/draft` and `POST /studios/:id/shop/publish`, the 3-panel builder editor (`/dashboard/builder`), and draft-layout editing. This phase renders only the already-published seed shop and reads its published config.

---

### Task 1: Item & Shop DTO mappers

**Files:**
- Create: `packages/shared/src/dto/item.ts`
- Create: `packages/shared/src/dto/shop.ts`
- Modify: `packages/shared/src/dto/index.ts`
- Test: `packages/shared/src/dto/item.test.ts`, `packages/shared/src/dto/shop.test.ts`

**Interfaces:**
- Consumes: `Prisma` (`@xgamefi/db`) for `Prisma.Decimal` and the generated `Item`/`Shop` row types; `toStellarAmount` from `@xgamefi/shared/money` (P0).
- Produces:
  - `type ItemDto = { id: string; studioId: string; externalId: string; name: string; description: string | null; imageUrl: string | null; price: { amount: string; currency: "XLM"|"USDT" }; stock: number | null; rarity: string | null; category: string | null; metadata: Record<string, unknown>; isActive: boolean; syncedAt: string | null }`
  - `function toItemDto(row: ItemRow): ItemDto` — `price.amount` is 7-dp via `toStellarAmount`; dates serialized ISO; never returns the raw row.
  - `type ShopDto = { studioId: string; slug: string; status: "DRAFT"|"PUBLISHED"; layout: ShopLayout; theme: Record<string, unknown>; featuredItemIds: string[]; publishedAt: string | null }` where `type ShopLayout = { mode: "grid"|"list"; sections: { id: string; title?: string; itemIds: string[] }[] }`
  - `function toShopDto(row: ShopRow & { studio: { slug: string } }): ShopDto`

- [ ] **Step 1: Write the failing test for `toItemDto`**

```ts
// packages/shared/src/dto/item.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { toItemDto } from "./item";

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  studioId: "22222222-2222-2222-2222-222222222222",
  externalId: "sword_skin_01",
  name: "Sword Skin",
  description: "A glowing blade",
  imageUrl: "https://cdn.example.com/sword.png",
  priceAmount: new Prisma.Decimal("1"),
  priceCurrency: "USDT" as const,
  stock: null,
  rarity: "LEGENDARY",
  category: "skins",
  metadata: { dmg: 10 },
  isActive: true,
  syncedAt: new Date("2026-06-23T12:00:00.000Z"),
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-23T12:00:00.000Z"),
};

describe("toItemDto", () => {
  it("maps a row to a DTO with 7dp price and ISO dates", () => {
    expect(toItemDto(row)).toEqual({
      id: row.id,
      studioId: row.studioId,
      externalId: "sword_skin_01",
      name: "Sword Skin",
      description: "A glowing blade",
      imageUrl: "https://cdn.example.com/sword.png",
      price: { amount: "1.0000000", currency: "USDT" },
      stock: null,
      rarity: "LEGENDARY",
      category: "skins",
      metadata: { dmg: 10 },
      isActive: true,
      syncedAt: "2026-06-23T12:00:00.000Z",
    });
  });

  it("never leaks raw row fields (no priceAmount/createdAt)", () => {
    const dto = toItemDto(row) as Record<string, unknown>;
    expect(dto.priceAmount).toBeUndefined();
    expect(dto.createdAt).toBeUndefined();
  });

  it("handles null metadata as empty object and null syncedAt", () => {
    const dto = toItemDto({ ...row, metadata: null, syncedAt: null });
    expect(dto.metadata).toEqual({});
    expect(dto.syncedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- item.test.ts`
Expected: FAIL — "Cannot find module './item'".

- [ ] **Step 3: Implement `toItemDto`**

```ts
// packages/shared/src/dto/item.ts
import { Prisma } from "@xgamefi/db";
import { toStellarAmount } from "../money";

export type ItemCurrency = "XLM" | "USDT";

export type ItemRow = {
  id: string;
  studioId: string;
  externalId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceAmount: Prisma.Decimal;
  priceCurrency: ItemCurrency;
  stock: number | null;
  rarity: string | null;
  category: string | null;
  metadata: Prisma.JsonValue | null;
  isActive: boolean;
  syncedAt: Date | null;
};

export type ItemDto = {
  id: string;
  studioId: string;
  externalId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: { amount: string; currency: ItemCurrency };
  stock: number | null;
  rarity: string | null;
  category: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  syncedAt: string | null;
};

export function toItemDto(row: ItemRow): ItemDto {
  return {
    id: row.id,
    studioId: row.studioId,
    externalId: row.externalId,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    price: { amount: toStellarAmount(row.priceAmount), currency: row.priceCurrency },
    stock: row.stock,
    rarity: row.rarity,
    category: row.category,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    isActive: row.isActive,
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- item.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `toShopDto`**

```ts
// packages/shared/src/dto/shop.test.ts
import { describe, it, expect } from "vitest";
import { toShopDto } from "./shop";

const row = {
  studioId: "22222222-2222-2222-2222-222222222222",
  status: "PUBLISHED" as const,
  layout: { mode: "grid", sections: [{ id: "main", itemIds: ["i1", "i2"] }] },
  draftLayout: { mode: "list", sections: [] },
  theme: { primaryFixed: "#c3f400" },
  featuredItemIds: ["i1"],
  publishedAt: new Date("2026-06-23T12:00:00.000Z"),
  studio: { slug: "gridlock" },
};

describe("toShopDto", () => {
  it("maps published config, omits draftLayout, serializes date", () => {
    expect(toShopDto(row)).toEqual({
      studioId: row.studioId,
      slug: "gridlock",
      status: "PUBLISHED",
      layout: { mode: "grid", sections: [{ id: "main", itemIds: ["i1", "i2"] }] },
      theme: { primaryFixed: "#c3f400" },
      featuredItemIds: ["i1"],
      publishedAt: "2026-06-23T12:00:00.000Z",
    });
  });

  it("defaults a null/invalid layout to an empty grid", () => {
    const dto = toShopDto({ ...row, layout: null });
    expect(dto.layout).toEqual({ mode: "grid", sections: [] });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- shop.test.ts`
Expected: FAIL — "Cannot find module './shop'".

- [ ] **Step 7: Implement `toShopDto`**

```ts
// packages/shared/src/dto/shop.ts
import { Prisma } from "@xgamefi/db";

export type ShopLayout = {
  mode: "grid" | "list";
  sections: { id: string; title?: string; itemIds: string[] }[];
};

export type ShopRow = {
  studioId: string;
  status: "DRAFT" | "PUBLISHED";
  layout: Prisma.JsonValue | null;
  theme: Prisma.JsonValue | null;
  featuredItemIds: string[];
  publishedAt: Date | null;
  studio: { slug: string };
};

export type ShopDto = {
  studioId: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  layout: ShopLayout;
  theme: Record<string, unknown>;
  featuredItemIds: string[];
  publishedAt: string | null;
};

function coerceLayout(value: Prisma.JsonValue | null): ShopLayout {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const mode = v.mode === "list" ? "list" : "grid";
    const sections = Array.isArray(v.sections) ? (v.sections as ShopLayout["sections"]) : [];
    return { mode, sections };
  }
  return { mode: "grid", sections: [] };
}

export function toShopDto(row: ShopRow): ShopDto {
  return {
    studioId: row.studioId,
    slug: row.studio.slug,
    status: row.status,
    layout: coerceLayout(row.layout),
    theme: (row.theme ?? {}) as Record<string, unknown>,
    featuredItemIds: row.featuredItemIds,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}
```

- [ ] **Step 8: Export from the DTO barrel**

```ts
// packages/shared/src/dto/index.ts  (append)
export * from "./item";
export * from "./shop";
```

- [ ] **Step 9: Run all DTO tests + typecheck**

Run: `pnpm --filter @xgamefi/shared test -- dto && pnpm --filter @xgamefi/shared exec tsc --noEmit`
Expected: PASS (5 tests), no type errors.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/dto
git commit -m "feat(shared): add toItemDto and toShopDto mappers"
```

---

### Task 2: Catalogue Zod schemas (remote items, ingest, overrides, query)

**Files:**
- Create: `packages/shared/src/zod/catalogue.ts`
- Modify: `packages/shared/src/zod/index.ts`
- Test: `packages/shared/src/zod/catalogue.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  - `RemoteItem` schema + `type RemoteItem` for `{ externalId, name, description?, imageUrl?, price, currency, stock?, metadata? }` (the §10 contract shape; `price` is a numeric string, `currency` is `"XLM"|"USDT"`, `stock` nullable int).
  - `RemoteItemsSchema = z.array(RemoteItem)` — used by both pull (`fetchRemoteItems`) and push (`/ingest/items`).
  - `ItemOverrideInput` schema for `PATCH /studios/:id/items/:itemId` → `{ priceAmount?, priceCurrency?, stock?, saleStartsAt?, saleEndsAt?, featured? }`.
  - `ShopItemsQuery` schema for `GET /shops/:slug/items` query → `{ q?, category?, rarity?, featured?, page (default 1), pageSize (default 24, max 60) }`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/zod/catalogue.test.ts
import { describe, it, expect } from "vitest";
import { RemoteItemsSchema, ItemOverrideInput, ShopItemsQuery } from "./catalogue";

describe("RemoteItemsSchema", () => {
  it("accepts the SPEC §10 shape", () => {
    const parsed = RemoteItemsSchema.parse([
      { externalId: "sword_skin_01", name: "Sword Skin", description: "x",
        imageUrl: "https://cdn.example.com/s.png", price: "1.0000000",
        currency: "USDT", stock: null, metadata: { dmg: 10 } },
    ]);
    expect(parsed[0].externalId).toBe("sword_skin_01");
    expect(parsed[0].price).toBe("1.0000000");
  });

  it("rejects an unknown currency", () => {
    expect(() => RemoteItemsSchema.parse([
      { externalId: "x", name: "X", price: "1", currency: "BTC" },
    ])).toThrow();
  });

  it("rejects a non-numeric price string", () => {
    expect(() => RemoteItemsSchema.parse([
      { externalId: "x", name: "X", price: "free", currency: "XLM" },
    ])).toThrow();
  });
});

describe("ItemOverrideInput", () => {
  it("accepts partial overrides", () => {
    const v = ItemOverrideInput.parse({ priceAmount: "2.5", featured: true });
    expect(v.priceAmount).toBe("2.5");
    expect(v.featured).toBe(true);
  });
  it("rejects an empty object (at least one field required)", () => {
    expect(() => ItemOverrideInput.parse({})).toThrow();
  });
});

describe("ShopItemsQuery", () => {
  it("applies defaults and coerces page numbers", () => {
    const v = ShopItemsQuery.parse({ q: "sword", page: "2" });
    expect(v).toMatchObject({ q: "sword", page: 2, pageSize: 24 });
  });
  it("caps pageSize at 60", () => {
    expect(() => ShopItemsQuery.parse({ pageSize: "100" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- catalogue.test.ts`
Expected: FAIL — "Cannot find module './catalogue'".

- [ ] **Step 3: Implement the schemas**

```ts
// packages/shared/src/zod/catalogue.ts
import { z } from "zod";

const numericString = z.string().regex(/^\d+(\.\d{1,7})?$/, "must be a numeric amount");
const currency = z.enum(["XLM", "USDT"]);

export const RemoteItem = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  imageUrl: z.string().url().nullish(),
  price: numericString,
  currency,
  stock: z.number().int().nonnegative().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});
export type RemoteItem = z.infer<typeof RemoteItem>;

export const RemoteItemsSchema = z.array(RemoteItem);

export const ItemOverrideInput = z
  .object({
    priceAmount: numericString.optional(),
    priceCurrency: currency.optional(),
    stock: z.number().int().nonnegative().nullable().optional(),
    saleStartsAt: z.string().datetime().nullable().optional(),
    saleEndsAt: z.string().datetime().nullable().optional(),
    featured: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field required" });
export type ItemOverrideInput = z.infer<typeof ItemOverrideInput>;

export const ShopItemsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().min(1).optional(),
  rarity: z.string().min(1).optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(60).default(24),
});
export type ShopItemsQuery = z.infer<typeof ShopItemsQuery>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- catalogue.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from the zod barrel**

```ts
// packages/shared/src/zod/index.ts  (append)
export * from "./catalogue";
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/zod
git commit -m "feat(shared): add catalogue zod schemas (remote items, overrides, query)"
```

---

### Task 3: Shared catalogue upsert (pull + push converge here)

**Files:**
- Create: `packages/shared/src/catalogue/upsert.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./catalogue/upsert"`)
- Test: `packages/shared/src/catalogue/upsert.test.ts`

**Interfaces:**
- Consumes: `prisma`, `Prisma` (`@xgamefi/db`); `RemoteItem` (Task 2).
- Produces:
  - `async function upsertCatalogueItems(studioId: string, items: RemoteItem[]): Promise<{ upserted: number; deactivated: number }>` — upserts each by unique `(studioId, externalId)` setting `priceAmount/priceCurrency/stock/metadata/syncedAt/isActive=true`; after upsert, marks any item of that studio whose `externalId` is NOT in the incoming set `isActive=false` (stale → inactive); runs in one `prisma.$transaction`. Studio-scoped: only ever touches rows where `studioId` matches.

- [ ] **Step 1: Write the failing test (mock prisma)**

```ts
// packages/shared/src/catalogue/upsert.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const updateMany = vi.fn();
const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ item: { upsert, updateMany } }),
);
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { $transaction } };
});

import { upsertCatalogueItems } from "./upsert";

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({});
  updateMany.mockReset().mockResolvedValue({ count: 3 });
  $transaction.mockClear();
});

describe("upsertCatalogueItems", () => {
  it("upserts each item by (studioId, externalId) and deactivates stale", async () => {
    const res = await upsertCatalogueItems("stu1", [
      { externalId: "a", name: "A", price: "1.0000000", currency: "USDT" },
      { externalId: "b", name: "B", price: "2", currency: "XLM" },
    ]);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].where).toEqual({
      studioId_externalId: { studioId: "stu1", externalId: "a" },
    });
    // stale = not in the incoming externalIds, scoped to studio, currently active
    expect(updateMany).toHaveBeenCalledWith({
      where: { studioId: "stu1", externalId: { notIn: ["a", "b"] }, isActive: true },
      data: { isActive: false },
    });
    expect(res).toEqual({ upserted: 2, deactivated: 3 });
  });

  it("deactivates all active items when given an empty list", async () => {
    await upsertCatalogueItems("stu1", []);
    expect(upsert).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { studioId: "stu1", externalId: { notIn: [] }, isActive: true },
      data: { isActive: false },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- upsert.test.ts`
Expected: FAIL — "Cannot find module './upsert'".

- [ ] **Step 3: Implement `upsertCatalogueItems`**

```ts
// packages/shared/src/catalogue/upsert.ts
import { prisma, Prisma } from "@xgamefi/db";
import type { RemoteItem } from "../zod/catalogue";

export async function upsertCatalogueItems(
  studioId: string,
  items: RemoteItem[],
): Promise<{ upserted: number; deactivated: number }> {
  const syncedAt = new Date();
  const externalIds = items.map((i) => i.externalId);

  return prisma.$transaction(async (tx) => {
    for (const item of items) {
      const base = {
        name: item.name,
        description: item.description ?? null,
        imageUrl: item.imageUrl ?? null,
        priceAmount: new Prisma.Decimal(item.price),
        priceCurrency: item.currency,
        stock: item.stock ?? null,
        metadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
        isActive: true,
        syncedAt,
      };
      await tx.item.upsert({
        where: { studioId_externalId: { studioId, externalId: item.externalId } },
        create: { studioId, externalId: item.externalId, ...base },
        update: base,
      });
    }

    const stale = await tx.item.updateMany({
      where: { studioId, externalId: { notIn: externalIds }, isActive: true },
      data: { isActive: false },
    });

    return { upserted: items.length, deactivated: stale.count };
  });
}
```

> Note: `PATCH` price/featured overrides (Task 7) are NOT clobbered here — overrides are stored on dedicated columns (`stock`, `priceAmount` when manually set) per SPEC §5; the upsert refreshes catalogue-sourced fields. If a studio has set a manual price override, Phase 4's builder owns that precedence; for Phase 2 the seed has no conflicting override, so sync-sets-price is correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- upsert.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/catalogue/upsert.ts packages/shared/src/index.ts
git commit -m "feat(shared): add upsertCatalogueItems (upsert by studioId+externalId, deactivate stale)"
```

---

### Task 4: Remote item fetch through the SSRF guard

**Files:**
- Create: `packages/shared/src/catalogue/fetch-remote.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./catalogue/fetch-remote"`)
- Test: `packages/shared/src/catalogue/fetch-remote.test.ts`

**Interfaces:**
- Consumes: `safeFetch` (`@xgamefi/shared/ssrf`, P0); `RemoteItemsSchema` (Task 2).
- Produces:
  - `async function fetchRemoteItems(apiBaseUrl: string): Promise<RemoteItem[]>` — joins `apiBaseUrl` + `/items`, calls `safeFetch` (10s timeout, 1 MB cap), parses JSON, validates with `RemoteItemsSchema`. Throws on non-2xx or schema failure. **Never** uses raw `fetch`.

- [ ] **Step 1: Write the failing test (mock safeFetch)**

```ts
// packages/shared/src/catalogue/fetch-remote.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetch = vi.fn();
vi.mock("../ssrf", () => ({ safeFetch }));

import { fetchRemoteItems } from "./fetch-remote";

beforeEach(() => safeFetch.mockReset());

describe("fetchRemoteItems", () => {
  it("fetches {apiBaseUrl}/items through safeFetch and validates", async () => {
    safeFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { externalId: "sword_skin_01", name: "Sword Skin", price: "1.0000000", currency: "USDT" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const items = await fetchRemoteItems("https://api.gridlock.gg");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://api.gridlock.gg/items",
      expect.objectContaining({ maxBytes: 1_000_000, timeoutMs: 10_000 }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("sword_skin_01");
  });

  it("throws on non-2xx", async () => {
    safeFetch.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchRemoteItems("https://api.gridlock.gg")).rejects.toThrow(/500/);
  });

  it("throws on schema-invalid payload", async () => {
    safeFetch.mockResolvedValue(
      new Response(JSON.stringify([{ externalId: "x" }]), { status: 200 }),
    );
    await expect(fetchRemoteItems("https://api.gridlock.gg")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test -- fetch-remote.test.ts`
Expected: FAIL — "Cannot find module './fetch-remote'".

- [ ] **Step 3: Implement `fetchRemoteItems`**

```ts
// packages/shared/src/catalogue/fetch-remote.ts
import { safeFetch } from "../ssrf";
import { RemoteItemsSchema, type RemoteItem } from "../zod/catalogue";

export async function fetchRemoteItems(apiBaseUrl: string): Promise<RemoteItem[]> {
  const url = apiBaseUrl.replace(/\/+$/, "") + "/items";
  const res = await safeFetch(url, { maxBytes: 1_000_000, timeoutMs: 10_000 });
  if (!res.ok) {
    throw new Error(`catalogue fetch failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  return RemoteItemsSchema.parse(json);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test -- fetch-remote.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/catalogue/fetch-remote.ts packages/shared/src/index.ts
git commit -m "feat(shared): add fetchRemoteItems via SSRF-guarded safeFetch"
```

---

### Task 5: `catalogue-sync` BullMQ worker (pull mode)

**Files:**
- Create: `apps/worker/src/jobs/catalogue-sync.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/src/jobs/catalogue-sync.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `fetchRemoteItems` (Task 4); `upsertCatalogueItems` (Task 3); `registerWorker` from `@xgamefi/shared/queues` (P0 registry stub).
- Produces:
  - `type CatalogueSyncJobData = { studioId: string }`
  - `async function catalogueSyncProcessor(job: { data: CatalogueSyncJobData }): Promise<{ upserted: number; deactivated: number }>` — loads the studio, asserts `integrationMode === "API_PULL"` and `apiBaseUrl` present, calls `fetchRemoteItems(apiBaseUrl)` then `upsertCatalogueItems(studioId, items)`. The `catalogue-sync` queue is enqueued by `POST /studios/:id/items/sync` (Task 8).

- [ ] **Step 1: Write the failing test**

```ts
// apps/worker/src/jobs/catalogue-sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const fetchRemoteItems = vi.fn();
const upsertCatalogueItems = vi.fn();

vi.mock("@xgamefi/db", () => ({ prisma: { studio: { findUnique } } }));
vi.mock("@xgamefi/shared", () => ({ fetchRemoteItems, upsertCatalogueItems }));

import { catalogueSyncProcessor } from "./catalogue-sync";

beforeEach(() => {
  findUnique.mockReset();
  fetchRemoteItems.mockReset();
  upsertCatalogueItems.mockReset();
});

describe("catalogueSyncProcessor", () => {
  it("pulls remote items and upserts them", async () => {
    findUnique.mockResolvedValue({
      id: "stu1", integrationMode: "API_PULL", apiBaseUrl: "https://api.gridlock.gg",
    });
    fetchRemoteItems.mockResolvedValue([
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1", currency: "USDT" },
    ]);
    upsertCatalogueItems.mockResolvedValue({ upserted: 1, deactivated: 0 });

    const res = await catalogueSyncProcessor({ data: { studioId: "stu1" } });

    expect(fetchRemoteItems).toHaveBeenCalledWith("https://api.gridlock.gg");
    expect(upsertCatalogueItems).toHaveBeenCalledWith("stu1", [
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1", currency: "USDT" },
    ]);
    expect(res).toEqual({ upserted: 1, deactivated: 0 });
  });

  it("throws when the studio is not in API_PULL mode", async () => {
    findUnique.mockResolvedValue({ id: "stu1", integrationMode: "WEBHOOK_PUSH", apiBaseUrl: null });
    await expect(catalogueSyncProcessor({ data: { studioId: "stu1" } })).rejects.toThrow(/API_PULL/);
    expect(fetchRemoteItems).not.toHaveBeenCalled();
  });

  it("throws when apiBaseUrl is missing", async () => {
    findUnique.mockResolvedValue({ id: "stu1", integrationMode: "API_PULL", apiBaseUrl: null });
    await expect(catalogueSyncProcessor({ data: { studioId: "stu1" } })).rejects.toThrow(/apiBaseUrl/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/worker test -- catalogue-sync.test.ts`
Expected: FAIL — "Cannot find module './catalogue-sync'".

- [ ] **Step 3: Implement the processor**

```ts
// apps/worker/src/jobs/catalogue-sync.ts
import { prisma } from "@xgamefi/db";
import { fetchRemoteItems, upsertCatalogueItems } from "@xgamefi/shared";

export type CatalogueSyncJobData = { studioId: string };

export async function catalogueSyncProcessor(job: {
  data: CatalogueSyncJobData;
}): Promise<{ upserted: number; deactivated: number }> {
  const { studioId } = job.data;
  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw new Error(`catalogue-sync: studio ${studioId} not found`);
  if (studio.integrationMode !== "API_PULL") {
    throw new Error(`catalogue-sync: studio ${studioId} is not in API_PULL mode`);
  }
  if (!studio.apiBaseUrl) {
    throw new Error(`catalogue-sync: studio ${studioId} has no apiBaseUrl`);
  }
  const items = await fetchRemoteItems(studio.apiBaseUrl);
  return upsertCatalogueItems(studioId, items);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/worker test -- catalogue-sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the worker (replace the P0 stub registration)**

```ts
// apps/worker/src/index.ts  (add near other registerWorker calls)
import { registerWorker } from "@xgamefi/shared/queues";
import { catalogueSyncProcessor } from "./jobs/catalogue-sync";

registerWorker("catalogue-sync", catalogueSyncProcessor);
```

- [ ] **Step 6: Typecheck worker**

Run: `pnpm --filter @xgamefi/worker exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/jobs/catalogue-sync.ts apps/worker/src/index.ts
git commit -m "feat(worker): implement catalogue-sync pull job"
```

---

### Task 6: Inbound ingest auth (API key + HMAC + timestamp)

**Files:**
- Create: `apps/web/lib/ingest-auth.ts`
- Test: `apps/web/lib/ingest-auth.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `verifyHmac` (`@xgamefi/shared/hmac`, P0); `env` (`@xgamefi/config/env`, for `WEBHOOK_TIMESTAMP_TOLERANCE_SEC`); Node `crypto` for hashing the presented key.
- Produces:
  - `class IngestAuthError extends Error { status: number }`
  - `async function authenticateIngest(headers: Headers, rawBody: string): Promise<{ studioId: string; apiKeyId: string }>` — reads `X-XGameFi-Key`, hashes it (sha256) and looks up a non-revoked `ApiKey` by `hashedKey`; reads `X-XGameFi-Signature` + `X-XGameFi-Timestamp`; calls `verifyHmac({ secret: webhookSecret, header, rawBody: ts + "." + rawBody, toleranceSec })` using the key's studio `webhookSecret*`. Throws `IngestAuthError(401)` on any failure.

> Note: `Studio.webhookSecretHash` is stored hashed for *outbound* verification by the game server. For *inbound* HMAC we need the raw secret; per AGENT.md §9 inbound `/ingest/*` is keyed by the API key. This task signs over the studio webhook secret material that is available to the verifier; the seed (P0) provisions a usable inbound secret. If the schema only stores `webhookSecretHash`, use the `ApiKey.hashedKey` itself as the shared HMAC secret material (both sides hold the issued key) — see impl. The test pins the exact secret source so the implementer cannot drift.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/ingest-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { signWebhook } from "@xgamefi/shared/hmac";

const findFirst = vi.fn();
vi.mock("@xgamefi/db", () => ({ prisma: { apiKey: { findFirst } } }));
vi.mock("@xgamefi/config/env", () => ({ env: { WEBHOOK_TIMESTAMP_TOLERANCE_SEC: 300 } }));

import { authenticateIngest, IngestAuthError } from "./ingest-auth";

const RAW_KEY = "xgk_test_secret_key";
const hashed = createHash("sha256").update(RAW_KEY).digest("hex");

beforeEach(() => findFirst.mockReset());

function headersFor(rawBody: string, key = RAW_KEY, secret = RAW_KEY) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signWebhook(secret, ts, ts + "." + rawBody);
  return new Headers({
    "x-xgamefi-key": key,
    "x-xgamefi-timestamp": String(ts),
    "x-xgamefi-signature": sig,
  });
}

describe("authenticateIngest", () => {
  it("returns studioId for a valid key + signature", async () => {
    findFirst.mockResolvedValue({ id: "key1", studioId: "stu1", hashedKey: hashed, revokedAt: null });
    const body = JSON.stringify([{ externalId: "a" }]);
    const res = await authenticateIngest(headersFor(body), body);
    expect(res).toEqual({ studioId: "stu1", apiKeyId: "key1" });
    expect(findFirst).toHaveBeenCalledWith({ where: { hashedKey: hashed, revokedAt: null } });
  });

  it("throws 401 for an unknown key", async () => {
    findFirst.mockResolvedValue(null);
    const body = "[]";
    await expect(authenticateIngest(headersFor(body), body)).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 for a tampered body (bad signature)", async () => {
    findFirst.mockResolvedValue({ id: "key1", studioId: "stu1", hashedKey: hashed, revokedAt: null });
    const headers = headersFor("[]");
    await expect(authenticateIngest(headers, '[{"externalId":"evil"}]')).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when the key header is missing", async () => {
    await expect(authenticateIngest(new Headers(), "[]")).rejects.toBeInstanceOf(IngestAuthError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- ingest-auth.test.ts`
Expected: FAIL — "Cannot find module './ingest-auth'".

- [ ] **Step 3: Implement `authenticateIngest`**

```ts
// apps/web/lib/ingest-auth.ts
import { createHash } from "node:crypto";
import { prisma } from "@xgamefi/db";
import { verifyHmac } from "@xgamefi/shared/hmac";
import { env } from "@xgamefi/config/env";

export class IngestAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "IngestAuthError";
  }
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function authenticateIngest(
  headers: Headers,
  rawBody: string,
): Promise<{ studioId: string; apiKeyId: string }> {
  const presentedKey = headers.get("x-xgamefi-key");
  const signature = headers.get("x-xgamefi-signature");
  const timestamp = headers.get("x-xgamefi-timestamp");
  if (!presentedKey || !signature || !timestamp) {
    throw new IngestAuthError("missing auth headers");
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: { hashedKey: hashKey(presentedKey), revokedAt: null },
  });
  if (!apiKey) throw new IngestAuthError("invalid api key");

  // The issued API key doubles as the shared HMAC secret material — both the
  // game server (holding the raw key) and the platform (storing its hash and
  // verifying against the presented raw key) share it.
  const ok = verifyHmac({
    secret: presentedKey,
    header: signature,
    rawBody: `${timestamp}.${rawBody}`,
    toleranceSec: env.WEBHOOK_TIMESTAMP_TOLERANCE_SEC,
  });
  if (!ok) throw new IngestAuthError("invalid signature");

  return { studioId: apiKey.studioId, apiKeyId: apiKey.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- ingest-auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/ingest-auth.ts
git commit -m "feat(web): ingest auth (api key hash lookup + HMAC verify)"
```

---

### Task 7: `POST /ingest/items` push handler (with idempotency)

**Files:**
- Create: `apps/web/app/api/v1/ingest/items/route.ts`
- Test: `apps/web/app/api/v1/ingest/items/route.test.ts`

**Interfaces:**
- Consumes: `authenticateIngest` (Task 6); `RemoteItemsSchema` (Task 2); `upsertCatalogueItems` (Task 3); `withIdempotency` (`@xgamefi/shared/idempotency`, P3) — **if not yet available**, fall back to the `IdempotencyKey` table directly via prisma (see impl note). Reads `Idempotency-Key` header.
- Produces: `POST` route handler. On success returns `200 { upserted, deactivated }`. On auth failure returns the `IngestAuthError.status`. On schema failure returns `400`.

> Idempotency note: Phase 2 runs before P3's `withIdempotency`. To avoid a forward dependency, this handler implements a minimal idempotency guard inline against the `IdempotencyKey` table keyed by the `Idempotency-Key` header + scope `"ingest:items"` + a sha256 of the raw body; if a row with the same key+requestHash exists, replay its `responseSnapshot`. This is replaced by `withIdempotency` when P3 lands (mechanical swap, same table).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/ingest/items/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateIngest = vi.fn();
const upsertCatalogueItems = vi.fn();
const idemFindUnique = vi.fn();
const idemCreate = vi.fn();

vi.mock("@/lib/ingest-auth", () => ({
  authenticateIngest,
  IngestAuthError: class extends Error { status = 401; },
}));
vi.mock("@xgamefi/shared", () => ({ upsertCatalogueItems }));
vi.mock("@xgamefi/db", () => ({
  prisma: { idempotencyKey: { findUnique: idemFindUnique, create: idemCreate } },
}));

import { POST } from "./route";

function req(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.xgamefi.dev/api/v1/ingest/items", {
    method: "POST",
    body,
    headers: new Headers({ "idempotency-key": "idem-1", ...headers }),
  });
}

beforeEach(() => {
  authenticateIngest.mockReset().mockResolvedValue({ studioId: "stu1", apiKeyId: "key1" });
  upsertCatalogueItems.mockReset().mockResolvedValue({ upserted: 1, deactivated: 0 });
  idemFindUnique.mockReset().mockResolvedValue(null);
  idemCreate.mockReset().mockResolvedValue({});
});

describe("POST /ingest/items", () => {
  it("upserts valid items and returns counts", async () => {
    const body = JSON.stringify([
      { externalId: "sword_skin_01", name: "Sword Skin", price: "1.0000000", currency: "USDT" },
    ]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upserted: 1, deactivated: 0 });
    expect(upsertCatalogueItems).toHaveBeenCalledWith("stu1", expect.any(Array));
  });

  it("returns 401 when auth fails", async () => {
    authenticateIngest.mockRejectedValue(Object.assign(new Error("bad"), { status: 401 }));
    const res = await POST(req("[]"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for schema-invalid items", async () => {
    const res = await POST(req(JSON.stringify([{ externalId: "x" }])));
    expect(res.status).toBe(400);
    expect(upsertCatalogueItems).not.toHaveBeenCalled();
  });

  it("replays a stored response for a repeated idempotency key", async () => {
    idemFindUnique.mockResolvedValue({ responseSnapshot: { upserted: 9, deactivated: 0 } });
    const res = await POST(req(JSON.stringify([
      { externalId: "a", name: "A", price: "1", currency: "XLM" },
    ])));
    expect(await res.json()).toEqual({ upserted: 9, deactivated: 0 });
    expect(upsertCatalogueItems).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- ingest/items/route.test.ts`
Expected: FAIL — "Cannot find module './route'".

- [ ] **Step 3: Implement the handler**

```ts
// apps/web/app/api/v1/ingest/items/route.ts
import { createHash } from "node:crypto";
import { prisma } from "@xgamefi/db";
import { upsertCatalogueItems } from "@xgamefi/shared";
import { RemoteItemsSchema } from "@xgamefi/shared/zod";
import { authenticateIngest, IngestAuthError } from "@/lib/ingest-auth";

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  let auth: { studioId: string; apiKeyId: string };
  try {
    auth = await authenticateIngest(req.headers, rawBody);
  } catch (err) {
    const status = err instanceof IngestAuthError ? err.status : 401;
    return Response.json({ error: "unauthorized" }, { status });
  }

  const parsed = RemoteItemsSchema.safeParse(safeJson(rawBody));
  if (!parsed.success) {
    return Response.json({ error: "invalid items payload" }, { status: 400 });
  }

  const idemKey = req.headers.get("idempotency-key");
  const requestHash = createHash("sha256").update(rawBody).digest("hex");
  const scope = "ingest:items";

  if (idemKey) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
    if (existing) {
      return Response.json(existing.responseSnapshot, { status: 200 });
    }
  }

  const result = await upsertCatalogueItems(auth.studioId, parsed.data);

  if (idemKey) {
    await prisma.idempotencyKey.create({
      data: { key: idemKey, scope, requestHash, responseSnapshot: result },
    });
  }

  return Response.json(result, { status: 200 });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- ingest/items/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/v1/ingest/items/route.ts"
git commit -m "feat(web): POST /ingest/items push handler with idempotency"
```

---

### Task 8: Studio items endpoints — list, sync trigger, override

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/items/route.ts` (`GET`)
- Create: `apps/web/app/api/v1/studios/[id]/items/sync/route.ts` (`POST`)
- Create: `apps/web/app/api/v1/studios/[id]/items/[itemId]/route.ts` (`PATCH`)
- Test: colocated `route.test.ts` for each.

**Interfaces:**
- Consumes: `getPrincipal`/`requireStudio`/`scopeToStudio` (`apps/web/lib/auth`, P1); `prisma`, `Prisma` (`@xgamefi/db`); `toItemDto` (Task 1); `ItemOverrideInput` (Task 2); `getQueue` (`@xgamefi/shared/queues`, P0); `CatalogueSyncJobData` (Task 5).
- Produces:
  - `GET /studios/:id/items` → `200 { items: ItemDto[] }`, studio-scoped, ordered by `createdAt`.
  - `POST /studios/:id/items/sync` → enqueues `catalogue-sync` with `{ studioId }`; `202 { enqueued: true }`.
  - `PATCH /studios/:id/items/:itemId` → applies `ItemOverrideInput`, returns `200 { item: ItemDto }`; `featured` toggles membership in `Shop.featuredItemIds`; sale window stored on `Item.metadata.saleWindow`.

> Next 16: route handler signature is `(req, ctx: { params: Promise<{ id: string }> })` — `params` is async; always `await ctx.params`.

- [ ] **Step 1: Write the failing test for GET list**

```ts
// apps/web/app/api/v1/studios/[id]/items/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/auth", () => ({ requireStudio, scopeToStudio }));
vi.mock("@xgamefi/db", () => ({ prisma: { item: { findMany } } }));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "stu1" }) };

beforeEach(() => {
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  scopeToStudio.mockReset();
  findMany.mockReset();
});

describe("GET /studios/:id/items", () => {
  it("returns studio-scoped item DTOs", async () => {
    findMany.mockResolvedValue([{
      id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
      description: null, imageUrl: null, priceAmount: { toFixed: () => "1.0000000" },
      priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: null,
      metadata: {}, isActive: true, syncedAt: null,
    }]);
    const res = await GET(new Request("https://x/api"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].externalId).toBe("sword_skin_01");
    expect(body.items[0].priceAmount).toBeUndefined();
    expect(scopeToStudio).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { studioId: "stu1" } }));
  });
});
```

> The test uses a `priceAmount` stub with `toFixed`; in real runs `toItemDto` uses `toStellarAmount`. Keep the stub minimal — assertions target DTO shape and scoping, not Decimal internals.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "studios/[id]/items/route.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement GET list**

```ts
// apps/web/app/api/v1/studios/[id]/items/route.ts
import { prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { requireStudio, scopeToStudio } from "@/lib/auth";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const rows = await prisma.item.findMany({
    where: { studioId },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ items: rows.map(toItemDto) }, { status: 200 });
}
```

- [ ] **Step 4: Write + run the sync-trigger test, then implement**

```ts
// apps/web/app/api/v1/studios/[id]/items/sync/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
const add = vi.fn();
const getQueue = vi.fn(() => ({ add }));
vi.mock("@/lib/auth", () => ({ requireStudio, scopeToStudio }));
vi.mock("@xgamefi/shared/queues", () => ({ getQueue }));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ id: "stu1" }) };
beforeEach(() => {
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  scopeToStudio.mockReset(); add.mockReset();
});
describe("POST /studios/:id/items/sync", () => {
  it("enqueues catalogue-sync and returns 202", async () => {
    const res = await POST(new Request("https://x", { method: "POST" }), ctx);
    expect(res.status).toBe(202);
    expect(getQueue).toHaveBeenCalledWith("catalogue-sync");
    expect(add).toHaveBeenCalledWith("catalogue-sync", { studioId: "stu1" });
  });
});
```

```ts
// apps/web/app/api/v1/studios/[id]/items/sync/route.ts
import { getQueue } from "@xgamefi/shared/queues";
import { requireStudio, scopeToStudio } from "@/lib/auth";
import type { CatalogueSyncJobData } from "@xgamefi/worker/jobs/catalogue-sync";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const data: CatalogueSyncJobData = { studioId };
  await getQueue("catalogue-sync").add("catalogue-sync", data);
  return Response.json({ enqueued: true }, { status: 202 });
}
```

> If importing the `CatalogueSyncJobData` type across the worker package boundary is awkward in the web tsconfig, inline the type as `{ studioId: string }` here. Both must stay structurally identical.

Run: `pnpm --filter @xgamefi/web test -- "items/sync/route.test.ts"` → PASS.

- [ ] **Step 5: Write + run the PATCH override test, then implement**

```ts
// apps/web/app/api/v1/studios/[id]/items/[itemId]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const shopUpdate = vi.fn();
const shopFindUnique = vi.fn();
vi.mock("@/lib/auth", () => ({ requireStudio, scopeToStudio }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: {
    item: { findFirst, update },
    shop: { findUnique: shopFindUnique, update: shopUpdate },
  } };
});
import { PATCH } from "./route";
const ctx = { params: Promise.resolve({ id: "stu1", itemId: "i1" }) };
beforeEach(() => {
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  scopeToStudio.mockReset();
  findFirst.mockReset().mockResolvedValue({ id: "i1", studioId: "stu1" });
  update.mockReset().mockResolvedValue({
    id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
    description: null, imageUrl: null, priceAmount: { toFixed: () => "2.5000000" },
    priceCurrency: "USDT", stock: 5, rarity: null, category: null, metadata: {}, isActive: true, syncedAt: null,
  });
  shopFindUnique.mockReset().mockResolvedValue({ studioId: "stu1", featuredItemIds: [] });
  shopUpdate.mockReset();
});
describe("PATCH /studios/:id/items/:itemId", () => {
  it("applies price/stock overrides and returns the DTO", async () => {
    const res = await PATCH(new Request("https://x", {
      method: "PATCH", body: JSON.stringify({ priceAmount: "2.5", stock: 5 }),
    }), ctx);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
    const body = await res.json();
    expect(body.item.price.amount).toBe("2.5000000");
  });
  it("adds the item to Shop.featuredItemIds when featured=true", async () => {
    await PATCH(new Request("https://x", { method: "PATCH", body: JSON.stringify({ featured: true }) }), ctx);
    expect(shopUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { featuredItemIds: ["i1"] },
    }));
  });
  it("400s on an empty override body", async () => {
    const res = await PATCH(new Request("https://x", { method: "PATCH", body: "{}" }), ctx);
    expect(res.status).toBe(400);
  });
  it("404s when the item is not in the studio", async () => {
    findFirst.mockResolvedValue(null);
    const res = await PATCH(new Request("https://x", {
      method: "PATCH", body: JSON.stringify({ stock: 1 }),
    }), ctx);
    expect(res.status).toBe(404);
  });
});
```

```ts
// apps/web/app/api/v1/studios/[id]/items/[itemId]/route.ts
import { prisma, Prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { ItemOverrideInput } from "@xgamefi/shared/zod";
import { requireStudio, scopeToStudio } from "@/lib/auth";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  const { id: studioId, itemId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const parsed = ItemOverrideInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid override" }, { status: 400 });
  }

  const existing = await prisma.item.findFirst({ where: { id: itemId, studioId } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const { priceAmount, priceCurrency, stock, saleStartsAt, saleEndsAt, featured } = parsed.data;
  const data: Prisma.ItemUpdateInput = {};
  if (priceAmount !== undefined) data.priceAmount = new Prisma.Decimal(priceAmount);
  if (priceCurrency !== undefined) data.priceCurrency = priceCurrency;
  if (stock !== undefined) data.stock = stock;
  if (saleStartsAt !== undefined || saleEndsAt !== undefined) {
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    data.metadata = { ...metadata, saleWindow: { startsAt: saleStartsAt ?? null, endsAt: saleEndsAt ?? null } } as Prisma.InputJsonValue;
  }

  const updated = await prisma.item.update({ where: { id: itemId }, data });

  if (featured !== undefined) {
    const shop = await prisma.shop.findUnique({ where: { studioId } });
    if (shop) {
      const set = new Set(shop.featuredItemIds);
      if (featured) set.add(itemId);
      else set.delete(itemId);
      await prisma.shop.update({ where: { studioId }, data: { featuredItemIds: [...set] } });
    }
  }

  return Response.json({ item: toItemDto(updated) }, { status: 200 });
}
```

Run: `pnpm --filter @xgamefi/web test -- "items/[itemId]/route.test.ts"` → PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @xgamefi/web exec tsc --noEmit`

```bash
git add "apps/web/app/api/v1/studios/[id]/items"
git commit -m "feat(web): studio items list, sync trigger, and override endpoints"
```

---

### Task 9: Public item endpoint `GET /items/:id`

**Files:**
- Create: `apps/web/app/api/v1/items/[id]/route.ts`
- Test: `apps/web/app/api/v1/items/[id]/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `toItemDto` (Task 1). Public — no auth, but only returns `isActive` items.
- Produces: `GET /items/:id` → `200 { item: ItemDto }` or `404`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/items/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const findFirst = vi.fn();
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { item: { findFirst } } };
});
import { GET } from "./route";
const ctx = { params: Promise.resolve({ id: "i1" }) };
beforeEach(() => findFirst.mockReset());
describe("GET /items/:id", () => {
  it("returns the active item DTO", async () => {
    findFirst.mockResolvedValue({
      id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
      description: null, imageUrl: null, priceAmount: { toFixed: () => "1.0000000" },
      priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: null,
      metadata: {}, isActive: true, syncedAt: null,
    });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).item.externalId).toBe("sword_skin_01");
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "i1", isActive: true } });
  });
  it("404s for an unknown or inactive item", async () => {
    findFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "items/[id]/route.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```ts
// apps/web/app/api/v1/items/[id]/route.ts
import { prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const row = await prisma.item.findFirst({ where: { id, isActive: true } });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ item: toItemDto(row) }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- "items/[id]/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/v1/items/[id]/route.ts"
git commit -m "feat(web): public GET /items/:id endpoint"
```

---

### Task 10: Shop config endpoints — studio config + public published config

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/shop/route.ts` (`GET`)
- Create: `apps/web/app/api/v1/shops/[slug]/route.ts` (`GET`)
- Test: colocated `route.test.ts` for each.

**Interfaces:**
- Consumes: `requireStudio`/`scopeToStudio` (P1); `prisma` (`@xgamefi/db`); `toShopDto` (Task 1).
- Produces:
  - `GET /studios/:id/shop` (studio) → `200 { shop: ShopDto }` (the studio's config; includes its current `status`). 404 if no shop.
  - `GET /shops/:slug` (public) → `200 { shop: ShopDto }` only when `status === "PUBLISHED"`; else `404`.

> Deferred to Phase 4 (notes only, NOT tasks): `PUT /studios/:id/shop/draft` (save layout/theme) and `POST /studios/:id/shop/publish` (promote draft → published). This phase reads published config only.

- [ ] **Step 1: Write the failing test for the public endpoint**

```ts
// apps/web/app/api/v1/shops/[slug]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const findFirst = vi.fn();
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { shop: { findFirst } } };
});
import { GET } from "./route";
const ctx = { params: Promise.resolve({ slug: "gridlock" }) };
beforeEach(() => findFirst.mockReset());
describe("GET /shops/:slug", () => {
  it("returns the published shop DTO", async () => {
    findFirst.mockResolvedValue({
      studioId: "stu1", status: "PUBLISHED",
      layout: { mode: "grid", sections: [] }, theme: { primaryFixed: "#c3f400" },
      featuredItemIds: ["i1"], publishedAt: new Date("2026-06-23T12:00:00.000Z"),
      studio: { slug: "gridlock" },
    });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).shop.slug).toBe("gridlock");
    expect(findFirst).toHaveBeenCalledWith({
      where: { studio: { slug: "gridlock" }, status: "PUBLISHED" },
      include: { studio: { select: { slug: true } } },
    });
  });
  it("404s when there is no published shop for the slug", async () => {
    findFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "shops/[slug]/route.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the public shop handler**

```ts
// apps/web/app/api/v1/shops/[slug]/route.ts
import { prisma } from "@xgamefi/db";
import { toShopDto } from "@xgamefi/shared/dto";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  const row = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    include: { studio: { select: { slug: true } } },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ shop: toShopDto(row) }, { status: 200 });
}
```

- [ ] **Step 4: Run public test (PASS), then write + implement the studio config handler**

```ts
// apps/web/app/api/v1/studios/[id]/shop/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/auth", () => ({ requireStudio, scopeToStudio }));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { shop: { findFirst } } };
});
import { GET } from "./route";
const ctx = { params: Promise.resolve({ id: "stu1" }) };
beforeEach(() => {
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  scopeToStudio.mockReset(); findFirst.mockReset();
});
describe("GET /studios/:id/shop", () => {
  it("returns the studio's shop config (any status)", async () => {
    findFirst.mockResolvedValue({
      studioId: "stu1", status: "DRAFT", layout: { mode: "grid", sections: [] },
      theme: {}, featuredItemIds: [], publishedAt: null, studio: { slug: "gridlock" },
    });
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).shop.status).toBe("DRAFT");
    expect(scopeToStudio).toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: { studioId: "stu1" },
      include: { studio: { select: { slug: true } } },
    });
  });
  it("404s when the studio has no shop", async () => {
    findFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://x"), ctx);
    expect(res.status).toBe(404);
  });
});
```

```ts
// apps/web/app/api/v1/studios/[id]/shop/route.ts
import { prisma } from "@xgamefi/db";
import { toShopDto } from "@xgamefi/shared/dto";
import { requireStudio, scopeToStudio } from "@/lib/auth";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  const principal = await requireStudio(studioId);
  scopeToStudio(principal, studioId);

  const row = await prisma.shop.findFirst({
    where: { studioId },
    include: { studio: { select: { slug: true } } },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ shop: toShopDto(row) }, { status: 200 });
}
```

Run both: `pnpm --filter @xgamefi/web test -- "shop/route.test.ts" "shops/[slug]/route.test.ts"` → PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/v1/studios/[id]/shop" "apps/web/app/api/v1/shops/[slug]/route.ts"
git commit -m "feat(web): GET /studios/:id/shop and public GET /shops/:slug"
```

---

### Task 11: Public storefront items query `GET /shops/:slug/items` (filter/search/paginate)

**Files:**
- Create: `apps/web/app/api/v1/shops/[slug]/items/route.ts` (`GET`)
- Create: `apps/web/lib/catalogue-queries.ts`
- Test: `apps/web/app/api/v1/shops/[slug]/items/route.test.ts`, `apps/web/lib/catalogue-queries.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@xgamefi/db`); `toItemDto` (Task 1); `ShopItemsQuery` (Task 2).
- Produces:
  - `async function getShopItems(slug: string, query: ShopItemsQuery): Promise<{ items: ItemDto[]; total: number; page: number; pageSize: number }>` (in `catalogue-queries.ts`) — resolves the studio by slug (must have a `PUBLISHED` shop), filters active items by `q` (name contains, case-insensitive), `category`, `rarity`, `featured` (membership in `Shop.featuredItemIds`), paginates.
  - `GET /shops/:slug/items` → `200` with the above shape.

- [ ] **Step 1: Write the failing test for `getShopItems`**

```ts
// apps/web/lib/catalogue-queries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const shopFindFirst = vi.fn();
const itemFindMany = vi.fn();
const itemCount = vi.fn();
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: {
    shop: { findFirst: shopFindFirst },
    item: { findMany: itemFindMany, count: itemCount },
  } };
});
import { getShopItems } from "./catalogue-queries";
const itemRow = {
  id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
  description: null, imageUrl: null, priceAmount: { toFixed: () => "1.0000000" },
  priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: "skins",
  metadata: {}, isActive: true, syncedAt: null,
};
beforeEach(() => {
  shopFindFirst.mockReset().mockResolvedValue({ studioId: "stu1", featuredItemIds: ["i1"] });
  itemFindMany.mockReset().mockResolvedValue([itemRow]);
  itemCount.mockReset().mockResolvedValue(1);
});
describe("getShopItems", () => {
  it("filters active items by search term and paginates", async () => {
    const res = await getShopItems("gridlock", { q: "sword", page: 1, pageSize: 24 });
    expect(itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        studioId: "stu1", isActive: true,
        name: { contains: "sword", mode: "insensitive" },
      }),
      skip: 0, take: 24,
    }));
    expect(res).toEqual({ items: [expect.objectContaining({ externalId: "sword_skin_01" })], total: 1, page: 1, pageSize: 24 });
  });
  it("filters by featured using Shop.featuredItemIds", async () => {
    await getShopItems("gridlock", { featured: true, page: 1, pageSize: 24 });
    expect(itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["i1"] } }),
    }));
  });
  it("returns empty when the slug has no published shop", async () => {
    shopFindFirst.mockResolvedValue(null);
    const res = await getShopItems("nope", { page: 1, pageSize: 24 });
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 24 });
    expect(itemFindMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- catalogue-queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getShopItems` (+ sibling read helpers used by pages)**

```ts
// apps/web/lib/catalogue-queries.ts
import { prisma, Prisma } from "@xgamefi/db";
import { toItemDto, toShopDto, type ItemDto, type ShopDto } from "@xgamefi/shared/dto";
import type { ShopItemsQuery } from "@xgamefi/shared/zod";

export async function getShopItems(
  slug: string,
  query: ShopItemsQuery,
): Promise<{ items: ItemDto[]; total: number; page: number; pageSize: number }> {
  const shop = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    select: { studioId: true, featuredItemIds: true },
  });
  if (!shop) {
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  const where: Prisma.ItemWhereInput = { studioId: shop.studioId, isActive: true };
  if (query.q) where.name = { contains: query.q, mode: "insensitive" };
  if (query.category) where.category = query.category;
  if (query.rarity) where.rarity = query.rarity;
  if (query.featured) where.id = { in: shop.featuredItemIds };

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  return { items: rows.map(toItemDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getPublishedShop(slug: string): Promise<ShopDto | null> {
  const row = await prisma.shop.findFirst({
    where: { studio: { slug }, status: "PUBLISHED" },
    include: { studio: { select: { slug: true } } },
  });
  return row ? toShopDto(row) : null;
}

export async function getPublicItem(id: string): Promise<ItemDto | null> {
  const row = await prisma.item.findFirst({ where: { id, isActive: true } });
  return row ? toItemDto(row) : null;
}

export async function getStudioBrand(slug: string): Promise<Record<string, unknown> | null> {
  const studio = await prisma.studio.findUnique({ where: { slug }, select: { brand: true, name: true } });
  if (!studio) return null;
  return { ...(studio.brand as Record<string, unknown> | null ?? {}), name: studio.name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- catalogue-queries.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write + implement the route handler**

```ts
// apps/web/app/api/v1/shops/[slug]/items/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const getShopItems = vi.fn();
vi.mock("@/lib/catalogue-queries", () => ({ getShopItems }));
import { GET } from "./route";
const ctx = { params: Promise.resolve({ slug: "gridlock" }) };
beforeEach(() => getShopItems.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24 }));
describe("GET /shops/:slug/items", () => {
  it("parses query params and delegates to getShopItems", async () => {
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/items?q=sword&page=2"), ctx);
    expect(res.status).toBe(200);
    expect(getShopItems).toHaveBeenCalledWith("gridlock", expect.objectContaining({ q: "sword", page: 2, pageSize: 24 }));
  });
  it("400s on an invalid pageSize", async () => {
    const res = await GET(new Request("https://x/api/v1/shops/gridlock/items?pageSize=999"), ctx);
    expect(res.status).toBe(400);
  });
});
```

```ts
// apps/web/app/api/v1/shops/[slug]/items/route.ts
import { ShopItemsQuery } from "@xgamefi/shared/zod";
import { getShopItems } from "@/lib/catalogue-queries";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = ShopItemsQuery.safeParse(params);
  if (!parsed.success) return Response.json({ error: "invalid query" }, { status: 400 });
  const result = await getShopItems(slug, parsed.data);
  return Response.json(result, { status: 200 });
}
```

Run: `pnpm --filter @xgamefi/web test -- "shops/[slug]/items/route.test.ts"` → PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @xgamefi/web exec tsc --noEmit`

```bash
git add "apps/web/app/api/v1/shops/[slug]/items/route.ts" apps/web/lib/catalogue-queries.ts
git commit -m "feat(web): public storefront items query with filter/search/paginate"
```

---

### Task 12: Studio `/dashboard/items` page (BRAND dashboard styling)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/items/page.tsx`
- Create: `apps/web/app/(studio)/dashboard/_components/item-row.tsx`
- Test: `apps/web/app/(studio)/dashboard/items/page.test.tsx`

**Interfaces:**
- Consumes: `requirePrincipal`/`requireStudio` (P1); `prisma` (`@xgamefi/db`); `toItemDto` (Task 1). Server Component (no `"use client"`).
- Produces: the `/dashboard/items` route. Renders a top nav `h-20` + `w-64` left rail shell (from the studio layout, assumed present from P1) and a list of item cards showing name, externalId (mono uppercase), price in `primary-fixed`, stock, rarity badge, active state.

> BRAND: top nav `h-20 border-b-2 border-primary`; left rail `w-64`; item cards `bg-surface-container-low border-2 border-outline-variant`; price `text-primary-fixed`; labels `font-mono uppercase tracking-[0.1em] text-[12px]`. Sharp corners, no rounding beyond the `--radius-DEFAULT` token.

- [ ] **Step 1: Write the failing render test**

```tsx
// apps/web/app/(studio)/dashboard/items/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireStudio = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStudio,
  requirePrincipal: vi.fn(async () => ({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" })),
}));
vi.mock("@xgamefi/db", async () => {
  const actual = await vi.importActual<typeof import("@xgamefi/db")>("@xgamefi/db");
  return { ...actual, prisma: { item: { findMany } } };
});

import Page from "./page";

beforeEach(() => {
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  findMany.mockReset().mockResolvedValue([{
    id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
    description: "blade", imageUrl: null, priceAmount: { toFixed: () => "1.0000000" },
    priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: "skins",
    metadata: {}, isActive: true, syncedAt: null,
  }]);
});

describe("/dashboard/items", () => {
  it("renders synced items with name, externalId and price", async () => {
    render(await Page());
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/sword_skin_01/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("LEGENDARY")).toBeInTheDocument();
  });
});
```

> Test env: vitest with `jsdom` environment + `@testing-library/react` (already configured in P0 web test setup). The page is an async Server Component, so `await Page()` returns the element tree directly.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "dashboard/items/page.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the item row component**

```tsx
// apps/web/app/(studio)/dashboard/_components/item-row.tsx
import type { ItemDto } from "@xgamefi/shared/dto";

const RARITY_CLASS: Record<string, string> = {
  LEGENDARY: "bg-primary-fixed text-on-primary-fixed",
  EPIC: "bg-secondary-container text-on-secondary-container",
  MYTHIC: "bg-secondary-container text-on-secondary-container",
  RARE: "bg-tertiary-container text-on-tertiary-container",
  LIMITED: "bg-error-container text-on-error-container",
};

export function ItemRow({ item }: { item: ItemDto }) {
  return (
    <div className="bg-surface-container-low border-2 border-outline-variant p-4 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-display text-[24px] leading-7 font-semibold text-on-surface">{item.name}</span>
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">{item.externalId}</span>
      </div>
      <div className="flex items-center gap-4">
        {item.rarity ? (
          <span className={`font-mono uppercase tracking-[0.1em] text-[10px] px-2 py-1 ${RARITY_CLASS[item.rarity] ?? "bg-surface-container-high text-on-surface-variant"}`}>
            {item.rarity}
          </span>
        ) : null}
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          {item.stock === null ? "UNLIMITED" : `STOCK ${item.stock}`}
        </span>
        <span className="font-display text-[24px] font-semibold text-primary-fixed">
          {item.price.amount} <span className="text-[12px] font-mono">{item.price.currency}</span>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the page**

```tsx
// apps/web/app/(studio)/dashboard/items/page.tsx
import { prisma } from "@xgamefi/db";
import { toItemDto } from "@xgamefi/shared/dto";
import { requireStudio, requirePrincipal } from "@/lib/auth";
import { ItemRow } from "../_components/item-row";

export default async function Page() {
  const principal = await requirePrincipal();
  const studioId = principal.kind === "user" ? principal.studioId : undefined;
  if (!studioId) {
    return <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-error">NO STUDIO CONTEXT</p>;
  }
  await requireStudio(studioId);

  const rows = await prisma.item.findMany({ where: { studioId }, orderBy: { createdAt: "asc" } });
  const items = rows.map(toItemDto);

  return (
    <section className="flex flex-col gap-4 p-8">
      <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">Items</h1>
      <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
        SYNCED FROM GAME API · {items.length} TOTAL
      </p>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- "dashboard/items/page.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/items/page.tsx" "apps/web/app/(studio)/dashboard/_components/item-row.tsx"
git commit -m "feat(web): /dashboard/items page with branded item rows"
```

---

### Task 13: Per-studio brand override helper

**Files:**
- Create: `apps/web/app/(storefront)/s/[slug]/brand.ts`
- Test: `apps/web/app/(storefront)/s/[slug]/brand.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type StudioBrand = { primary?: string; secondary?: string; bg?: string; logo?: string; name?: string }`
  - `function brandToCssVars(brand: StudioBrand | null | undefined): React.CSSProperties` — maps studio brand overrides onto the BRAND `@theme` CSS custom properties (`--color-primary-fixed`, `--color-secondary-container`, `--color-background`) applied via inline `style` on the storefront root so per-studio colors layer over the Neon Overdrive skeleton. Unset fields fall through to the global theme (no override emitted).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/(storefront)/s/[slug]/brand.test.ts
import { describe, it, expect } from "vitest";
import { brandToCssVars } from "./brand";

describe("brandToCssVars", () => {
  it("maps brand overrides to CSS theme variables", () => {
    expect(brandToCssVars({ primary: "#00ff00", secondary: "#ff00ff", bg: "#000000" })).toEqual({
      "--color-primary-fixed": "#00ff00",
      "--color-secondary-container": "#ff00ff",
      "--color-background": "#000000",
      "--color-surface": "#000000",
    });
  });
  it("omits unset fields so the global theme shows through", () => {
    expect(brandToCssVars({ primary: "#00ff00" })).toEqual({ "--color-primary-fixed": "#00ff00" });
  });
  it("returns an empty object for null brand", () => {
    expect(brandToCssVars(null)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "s/[slug]/brand.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `brandToCssVars`**

```ts
// apps/web/app/(storefront)/s/[slug]/brand.ts
import type { CSSProperties } from "react";

export type StudioBrand = {
  primary?: string;
  secondary?: string;
  bg?: string;
  logo?: string;
  name?: string;
};

export function brandToCssVars(brand: StudioBrand | null | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  if (!brand) return vars as CSSProperties;
  if (brand.primary) vars["--color-primary-fixed"] = brand.primary;
  if (brand.secondary) vars["--color-secondary-container"] = brand.secondary;
  if (brand.bg) {
    vars["--color-background"] = brand.bg;
    vars["--color-surface"] = brand.bg;
  }
  return vars as CSSProperties;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- "s/[slug]/brand.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(storefront)/s/[slug]/brand.ts"
git commit -m "feat(web): per-studio brand override CSS-var helper"
```

---

### Task 14: Storefront item card + client filter/search islands

**Files:**
- Create: `apps/web/app/(storefront)/s/[slug]/_components/item-card.tsx`
- Create: `apps/web/app/(storefront)/s/[slug]/_components/storefront-filters.tsx`
- Create: `apps/web/app/(storefront)/s/[slug]/_components/item-modal.tsx`
- Test: `apps/web/app/(storefront)/s/[slug]/_components/item-card.test.tsx`

**Interfaces:**
- Consumes: `ItemDto` (Task 1).
- Produces:
  - `ItemCard({ item, slug })` — Server-renderable card. BRAND item card: `bg-surface-container-low border-2 border-outline-variant`, rarity badge top-left, price in `text-primary-fixed`, links to `/s/[slug]/item/[itemId]`.
  - `StorefrontFilters({ slug, categories, rarities })` — `"use client"` island that updates URL search params (`q`, `category`, `rarity`, `featured`) to re-query server-side.
  - `ItemModal({ item, slug })` — `"use client"` modal overlay for the item detail (used by the detail route as a parallel/intercepting route in P4; here a simple controllable modal).

- [ ] **Step 1: Write the failing test for `ItemCard`**

```tsx
// apps/web/app/(storefront)/s/[slug]/_components/item-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "./item-card";

const item = {
  id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
  description: "blade", imageUrl: "https://cdn/x.png",
  price: { amount: "1.0000000", currency: "USDT" as const },
  stock: null, rarity: "LEGENDARY", category: "skins", metadata: {}, isActive: true, syncedAt: null,
};

describe("ItemCard", () => {
  it("renders name, price in primary-fixed, rarity badge and detail link", () => {
    render(<ItemCard item={item} slug="gridlock" />);
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("LEGENDARY")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/s/gridlock/item/i1");
  });
  it("renders price element with the primary-fixed token class", () => {
    const { container } = render(<ItemCard item={item} slug="gridlock" />);
    expect(container.querySelector(".text-primary-fixed")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "item-card.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ItemCard`**

```tsx
// apps/web/app/(storefront)/s/[slug]/_components/item-card.tsx
import Link from "next/link";
import type { ItemDto } from "@xgamefi/shared/dto";

const RARITY_CLASS: Record<string, string> = {
  LEGENDARY: "bg-primary-fixed text-on-primary-fixed",
  EPIC: "bg-secondary-container text-on-secondary-container",
  MYTHIC: "bg-secondary-container text-on-secondary-container",
  RARE: "bg-tertiary-container text-on-tertiary-container",
  LIMITED: "bg-error-container text-on-error-container",
};

export function ItemCard({ item, slug }: { item: ItemDto; slug: string }) {
  return (
    <Link
      href={`/s/${slug}/item/${item.id}`}
      className="group relative flex flex-col bg-surface-container-low border-2 border-outline-variant transition-colors hover:border-primary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed"
    >
      {item.rarity ? (
        <span className={`absolute top-2 left-2 z-10 font-mono uppercase tracking-[0.1em] text-[10px] px-2 py-1 ${RARITY_CLASS[item.rarity] ?? "bg-surface-container-high text-on-surface-variant"}`}>
          {item.rarity}
        </span>
      ) : null}
      <div className="aspect-square bg-surface-container-lowest overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : null}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="font-display text-[16px] leading-6 text-on-surface">{item.name}</span>
        <span className="font-display text-[16px] font-semibold text-primary-fixed">
          {item.price.amount} <span className="font-mono text-[10px] uppercase">{item.price.currency}</span>
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run `ItemCard` test (PASS), then implement the filter + modal islands**

```tsx
// apps/web/app/(storefront)/s/[slug]/_components/storefront-filters.tsx
"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

export function StorefrontFilters({
  categories,
  rarities,
}: {
  categories: string[];
  rarities: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        defaultValue={params.get("q") ?? ""}
        placeholder="SEARCH"
        aria-label="Search items"
        onChange={(e) => setParam("q", e.target.value)}
        className="bg-transparent border-b-2 border-outline-variant focus:border-primary-fixed outline-none font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface placeholder:text-outline py-1"
      />
      <select
        aria-label="Category"
        defaultValue={params.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
        className="bg-surface-container-high border-2 border-outline-variant font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface px-2 py-1"
      >
        <option value="">ALL CATEGORIES</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c.toUpperCase()}</option>
        ))}
      </select>
      <select
        aria-label="Rarity"
        defaultValue={params.get("rarity") ?? ""}
        onChange={(e) => setParam("rarity", e.target.value)}
        className="bg-surface-container-high border-2 border-outline-variant font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface px-2 py-1"
      >
        <option value="">ALL RARITIES</option>
        {rarities.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setParam("featured", params.get("featured") ? "" : "true")}
        aria-pressed={Boolean(params.get("featured"))}
        className="font-mono uppercase tracking-[0.1em] text-[12px] border-2 border-outline-variant px-3 py-1 text-on-surface aria-pressed:bg-primary-fixed aria-pressed:text-on-primary-fixed"
      >
        FEATURED
      </button>
    </div>
  );
}
```

```tsx
// apps/web/app/(storefront)/s/[slug]/_components/item-modal.tsx
"use client";
import { useRouter } from "next/navigation";
import type { ItemDto } from "@xgamefi/shared/dto";

export function ItemModal({ item }: { item: ItemDto }) {
  const router = useRouter();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={() => router.back()}
    >
      <div
        className="bg-surface-container-low border-2 border-primary-fixed max-w-lg w-full p-6 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-[24px] font-semibold text-on-surface">{item.name}</h2>
        <p className="font-body text-[16px] text-on-surface-variant">{item.description}</p>
        <span className="font-display text-[24px] font-semibold text-primary-fixed">
          {item.price.amount} <span className="font-mono text-[12px] uppercase">{item.price.currency}</span>
        </span>
        <button
          type="button"
          onClick={() => router.back()}
          className="self-start font-mono uppercase tracking-[0.1em] text-[12px] border-2 border-outline-variant px-3 py-1 text-on-surface hover:border-primary-fixed"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
```

Run: `pnpm --filter @xgamefi/web test -- "item-card.test.tsx"` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(storefront)/s/[slug]/_components"
git commit -m "feat(web): storefront item card + filter/modal client islands"
```

---

### Task 15: Storefront grid page `/s/[slug]` (acceptance gate render)

**Files:**
- Create: `apps/web/app/(storefront)/s/[slug]/layout.tsx`
- Create: `apps/web/app/(storefront)/s/[slug]/page.tsx`
- Test: `apps/web/app/(storefront)/s/[slug]/storefront.test.tsx`

**Interfaces:**
- Consumes: `getPublishedShop`, `getShopItems`, `getStudioBrand` (Task 11); `ShopItemsQuery` (Task 2); `brandToCssVars` (Task 13); `ItemCard`, `StorefrontFilters` (Task 14). Server Components; `notFound()` from `next/navigation` when no published shop.
- Produces: the `/s/[slug]` route — server-rendered branded item grid with filter/search/featured, wrapped in the per-studio brand layout. **Acceptance gate:** `/s/gridlock` renders the seeded shop; Sword Skin visible.

> Next 16: `params` and `searchParams` are async — `await` both.

- [ ] **Step 1: Write the failing acceptance render test**

```tsx
// apps/web/app/(storefront)/s/[slug]/storefront.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const getPublishedShop = vi.fn();
const getShopItems = vi.fn();
const getStudioBrand = vi.fn();
vi.mock("@/lib/catalogue-queries", () => ({ getPublishedShop, getShopItems, getStudioBrand }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import Page from "./page";

const swordItem = {
  id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
  description: "A glowing blade", imageUrl: null,
  price: { amount: "1.0000000", currency: "USDT" as const },
  stock: null, rarity: "LEGENDARY", category: "skins", metadata: {}, isActive: true, syncedAt: null,
};

beforeEach(() => {
  getPublishedShop.mockReset().mockResolvedValue({
    studioId: "stu1", slug: "gridlock", status: "PUBLISHED",
    layout: { mode: "grid", sections: [] }, theme: {}, featuredItemIds: ["i1"], publishedAt: "2026-06-23T12:00:00.000Z",
  });
  getShopItems.mockReset().mockResolvedValue({ items: [swordItem], total: 1, page: 1, pageSize: 24 });
  getStudioBrand.mockReset().mockResolvedValue({ name: "Gridlock Games", primary: "#c3f400" });
});

describe("/s/gridlock", () => {
  it("renders the seeded shop with Sword Skin visible (acceptance gate)", async () => {
    const el = await Page({
      params: Promise.resolve({ slug: "gridlock" }),
      searchParams: Promise.resolve({}),
    });
    render(el);
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("LEGENDARY")).toBeInTheDocument();
  });

  it("calls notFound when there is no published shop", async () => {
    getPublishedShop.mockResolvedValue(null);
    await expect(
      Page({ params: Promise.resolve({ slug: "nope" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "storefront.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the brand layout**

```tsx
// apps/web/app/(storefront)/s/[slug]/layout.tsx
import { getStudioBrand } from "@/lib/catalogue-queries";
import { brandToCssVars, type StudioBrand } from "./brand";

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = (await getStudioBrand(slug)) as StudioBrand | null;
  return (
    <div style={brandToCssVars(brand)} className="min-h-screen bg-background text-on-background">
      <header className="h-20 border-b-2 border-primary flex items-center px-8">
        <span className="font-display italic text-[24px] font-semibold text-on-surface">
          {brand?.name ?? slug}
        </span>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Implement the grid page**

```tsx
// apps/web/app/(storefront)/s/[slug]/page.tsx
import { notFound } from "next/navigation";
import { ShopItemsQuery } from "@xgamefi/shared/zod";
import { getPublishedShop, getShopItems } from "@/lib/catalogue-queries";
import { ItemCard } from "./_components/item-card";
import { StorefrontFilters } from "./_components/storefront-filters";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const shop = await getPublishedShop(slug);
  if (!shop) notFound();

  const rawQuery = await searchParams;
  const query = ShopItemsQuery.parse({
    q: typeof rawQuery.q === "string" ? rawQuery.q : undefined,
    category: typeof rawQuery.category === "string" ? rawQuery.category : undefined,
    rarity: typeof rawQuery.rarity === "string" ? rawQuery.rarity : undefined,
    featured: rawQuery.featured === "true" ? true : undefined,
    page: typeof rawQuery.page === "string" ? rawQuery.page : undefined,
  });

  const { items, total } = await getShopItems(slug, query);
  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))];
  const rarities = [...new Set(items.map((i) => i.rarity).filter((r): r is string => !!r))];

  return (
    <main className="px-8 py-8 flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">
          STORE
        </h1>
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          {total} ITEMS
        </span>
      </div>
      <StorefrontFilters categories={categories} rarities={rarities} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} slug={slug} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- "storefront.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(storefront)/s/[slug]/layout.tsx" "apps/web/app/(storefront)/s/[slug]/page.tsx"
git commit -m "feat(web): /s/[slug] branded storefront grid (acceptance gate)"
```

---

### Task 16: Storefront item detail page `/s/[slug]/item/[itemId]`

**Files:**
- Create: `apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx`
- Test: `apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.test.tsx`

**Interfaces:**
- Consumes: `getPublicItem` (Task 11); `notFound()` from `next/navigation`. Server Component page. (The intercepting-route modal variant is Phase 4; here the page renders standalone, plus the `ItemModal` from Task 14 is available for an in-grid overlay.)
- Produces: the `/s/[slug]/item/[itemId]` route — full detail view (name, description, price, rarity, stats from `metadata`).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const getPublicItem = vi.fn();
vi.mock("@/lib/catalogue-queries", () => ({ getPublicItem }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import Page from "./page";

beforeEach(() => {
  getPublicItem.mockReset().mockResolvedValue({
    id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
    description: "A glowing blade", imageUrl: null,
    price: { amount: "1.0000000", currency: "USDT" },
    stock: null, rarity: "LEGENDARY", category: "skins", metadata: { dmg: 10 }, isActive: true, syncedAt: null,
  });
});

describe("/s/gridlock/item/i1", () => {
  it("renders item detail with description and price", async () => {
    const el = await Page({ params: Promise.resolve({ slug: "gridlock", itemId: "i1" }) });
    render(el);
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText("A glowing blade")).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
  });
  it("calls notFound for a missing item", async () => {
    getPublicItem.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ slug: "gridlock", itemId: "x" }) })).rejects.toThrow("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/web test -- "item/[itemId]/page.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the detail page**

```tsx
// apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx
import { notFound } from "next/navigation";
import { getPublicItem } from "@/lib/catalogue-queries";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { itemId } = await params;
  const item = await getPublicItem(itemId);
  if (!item) notFound();

  const stats = Object.entries(item.metadata);

  return (
    <main className="px-8 py-8 grid md:grid-cols-2 gap-8">
      <div className="aspect-square bg-surface-container-lowest border-2 border-outline-variant overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {item.rarity ? (
          <span className="self-start font-mono uppercase tracking-[0.1em] text-[10px] px-2 py-1 bg-primary-fixed text-on-primary-fixed">
            {item.rarity}
          </span>
        ) : null}
        <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">
          {item.name}
        </h1>
        <p className="font-body text-[16px] leading-6 text-on-surface-variant">{item.description}</p>
        <span className="font-display text-[24px] font-semibold text-primary-fixed">
          {item.price.amount} <span className="font-mono text-[12px] uppercase">{item.price.currency}</span>
        </span>
        {stats.length > 0 ? (
          <dl className="grid grid-cols-2 gap-2 border-t-2 border-outline-variant pt-4">
            {stats.map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <dt className="font-mono uppercase tracking-[0.1em] text-[10px] text-outline">{k}</dt>
                <dd className="font-mono text-[12px] text-on-surface">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/web test -- "item/[itemId]/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(storefront)/s/[slug]/item/[itemId]/page.tsx"
git commit -m "feat(web): /s/[slug]/item/[itemId] detail page"
```

---

### Task 17: Phase verification — full suite, typecheck, and acceptance check

**Files:**
- No new files; runs the full Phase 2 surface.

**Interfaces:**
- Consumes: everything built in Tasks 1–16.
- Produces: a green Phase 2.

- [ ] **Step 1: Run the full shared + web + worker test suites**

Run:
```bash
pnpm --filter @xgamefi/shared test
pnpm --filter @xgamefi/web test
pnpm --filter @xgamefi/worker test
```
Expected: all PASS — DTO mappers (5), catalogue zod (7), upsert (2), fetch-remote (3), catalogue-sync (3), ingest-auth (4), ingest/items (4), studio items list/sync/override (1+1+4), public item (2), studio+public shop (2+2), shop items query + helper (2+3), dashboard items page (1), brand (3), item-card (2), storefront grid (2), item detail (2).

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm -r exec tsc --noEmit`
Expected: no errors. (Confirms cross-package types — `ItemDto`, `ShopDto`, `RemoteItem`, `CatalogueSyncJobData` — line up.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean (no raw `fetch` to studio URLs; client islands marked `"use client"`).

- [ ] **Step 4: Acceptance — render smoke for `/s/gridlock`**

Run: `pnpm --filter @xgamefi/web test -- "storefront.test.tsx"`
Expected: PASS — `/s/gridlock` renders the seeded shop with the Sword Skin visible. (Playwright is NOT required this phase; the demo e2e lands in Phase 3/7. This vitest render smoke satisfies the Phase 2 gate.)

> Optional manual check (if a dev stack is up): `pnpm db:seed && pnpm --filter web dev`, then open `http://localhost:3000/s/gridlock` and confirm the Sword Skin card renders with its `1.0000000 USDT` price in lime and the `LEGENDARY` badge.

- [ ] **Step 5: Commit (no-op if clean) / tag phase**

```bash
git commit --allow-empty -m "chore: Phase 2 catalogue + storefront verified (s/gridlock renders Sword Skin)"
```

---

## Self-Review

**1. Spec coverage** (catalogue + storefront-read scope):

| Requirement (SPEC §) | Task |
| --- | --- |
| Item model usage / DTO (§5) | Task 1 (`toItemDto`), Task 8/9/11 queries |
| Shop config DTO (§5/§7) | Task 1 (`toShopDto`) |
| `catalogue-sync` pull via `safeFetch`, upsert by `(studioId,externalId)`, mark stale inactive (§9/§10) | Task 4 (`fetchRemoteItems`), Task 3 (`upsertCatalogueItems`), Task 5 (worker, registry stub filled) |
| `POST /ingest/items` push: API key hash + HMAC + timestamp + idempotency, same shape (§7/§10) | Task 6 (auth), Task 7 (handler) |
| `GET /studios/:id/items` (studio, scopeToStudio) (§7) | Task 8 |
| `POST /studios/:id/items/sync` (enqueue catalogue-sync) (§7) | Task 8 |
| `PATCH /studios/:id/items/:itemId` (price/currency/stock/sale-window/featured) (§7) | Task 8 |
| `GET /items/:id` (public) (§7) | Task 9 |
| `GET /studios/:id/shop` (studio) (§7) | Task 10 |
| `GET /shops/:slug` (public published) (§7) | Task 10 |
| `GET /shops/:slug/items` (public filter/search/paginate) (§7) | Task 11 |
| `/dashboard/items` page, BRAND dashboard styling (§6) | Task 12 |
| `/s/[slug]` server-rendered grid + filter/search/featured, BRAND item cards (§6) | Tasks 13–15 |
| `/s/[slug]/item/[itemId]` detail (page + modal) (§6) | Task 14 (modal), Task 16 (page) |
| Per-studio brand overrides over Neon Overdrive (BRAND) | Task 13, Task 15 layout |
| Mapped DTOs never raw rows (AGENT §6) | Tasks 1, 8–11, 16 (all return DTOs; tests assert `priceAmount`/`createdAt` absent) |
| `studioId` scoping (AGENT §7) | Tasks 8, 10, 12 (assert `scopeToStudio` called) |
| Acceptance gate `/s/gridlock` shows Sword Skin | Task 15, Task 17 |

Both pull (Tasks 3–5) and push (Tasks 6–7) modes covered. All read endpoints covered. Both storefront pages covered.
Deferred-to-P4 (`PUT /shops/draft`, `POST /shops/publish`, builder) are noted, not tasked — correct per scope.

**2. Placeholder scan:** No "TBD/TODO/implement later"; every code step has full code; every test step has runnable assertions; commands have expected output. The two forward-dependency notes (ingest idempotency before P3's `withIdempotency`; `webhookSecretHash` vs API-key HMAC secret in Task 6) are explicit decisions with concrete impl, not placeholders.

**3. Type consistency:**
- `ItemDto`/`ShopDto`/`ShopLayout` defined in Task 1 and consumed identically in Tasks 8–16 (`item.price.amount`, `item.price.currency`, `item.rarity`, `item.metadata`).
- `RemoteItem`/`RemoteItemsSchema` defined Task 2, consumed in Tasks 3, 4, 7.
- `ShopItemsQuery` defined Task 2, consumed in Tasks 11, 15.
- `CatalogueSyncJobData` defined Task 5, consumed in Task 8 (with inline-fallback note keeping the shape identical `{ studioId }`).
- `upsertCatalogueItems` / `fetchRemoteItems` exported from `@xgamefi/shared` and imported with that name everywhere (Tasks 5, 7).
- `authenticateIngest`/`IngestAuthError` defined Task 6, consumed Task 7.
- `getShopItems`/`getPublishedShop`/`getPublicItem`/`getStudioBrand` defined Task 11, consumed Tasks 15, 16.
- `brandToCssVars`/`StudioBrand` defined Task 13, consumed Task 15.
- Canonical signatures used verbatim: `safeFetch`, `verifyHmac({ secret, header, rawBody, toleranceSec })`, `toStellarAmount`, `scopeToStudio(principal, studioId)`, `requireStudio(studioId)`, `getQueue(name)`, `registerWorker(name, processor)`, `toItemDto`/`toShopDto`. Consistent.

No gaps found.
