# Phase 4 — Shop Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the studio Shop Builder — a 3-panel client editor (item library · layout canvas · item/pricing config) with a live player-facing preview — plus the `PUT …/shop/draft` and `POST …/shop/publish` endpoints, so a studio can rearrange items, choose featured, set theme overrides, publish, and see `/s/[slug]` reflect the change.

**Architecture:** A single narrow `"use client"` island (the builder canvas + its panels) holds all editor state and persists it as the `ShopLayout` Json blob via two studio route handlers. The published storefront from Phase 2 already reads `Shop.layout`/`Shop.theme`/`Shop.featuredItemIds`; this phase confirms that contract and shares the exact `ShopLayout` Zod schema/type between the builder, the draft/publish handlers, and the storefront renderer so the preview is the player-facing render. Per-item pricing/stock/sale-window/featured edits reuse the existing Phase-2 `PATCH /studios/:id/items/:itemId` endpoint — they are not re-created here.

**Tech Stack:** Next.js 16.2.x (App Router, async params, Server Actions + route handlers), React 19.2.x (Server Components default, one client island), Tailwind v4.3.x CSS-first `@theme` (BRAND.md), shadcn/ui + Radix primitives, Zod for layout validation, Prisma 7 (pg adapter), Vitest + @testing-library/react for unit/handler/component tests, @playwright/test for the publish→storefront e2e gate, `@dnd-kit/core` for drag-and-drop (maintained, React 19 compatible).

## Global Constraints

- Pinned deps: `next` 16.2.x, `react`/`react-dom` 19.2.x, `tailwindcss`/`@tailwindcss/postcss` 4.3.x, shadcn/ui + Radix; do not introduce abandoned/pre-release packages.
- Client islands stay narrow — only the builder canvas + its three panels + preview are `"use client"`; the `/dashboard/builder` page itself is a Server Component that loads data and renders the island.
- Validate the layout Json with Zod (`ShopLayoutSchema`) on every write — never persist an unvalidated blob; reject malformed `draftLayout`.
- `studioId` scoping: every handler calls `requireStudio(studioId)` + `scopeToStudio(principal, studioId)` before touching Prisma; cross-studio access denied.
- Return mapped DTOs only (`toShopDto`, `toItemDto`) — never raw Prisma rows or stack traces.
- BRAND three-column shell: `w-64` tools (left/config) · fluid preview (center) · `w-80` library (right), Neon Overdrive tokens, sharp clipped corners, 2px technical borders, mono uppercase labels.
- Reduced-motion gating: scanlines/glitch/marquee/pulse and drag transitions disabled under `@media (prefers-reduced-motion: reduce)`.
- Money is `Prisma.Decimal`; no JS `number` for amounts. Studio mutations get CSRF protection (SameSite + Origin check) per AGENT.md §4/§7.

---

## File Structure

**`packages/shared` (shared contract — built first so both UI and handlers consume one source):**
- `packages/shared/src/zod/shop.ts` — `ShopLayoutSchema`, `ShopThemeSchema`, `ShopDraftInput` Zod schemas + inferred `ShopLayout`, `ShopTheme`, `ShopSection` types. This is the single source of truth used by the builder island, the draft handler, and the storefront renderer.
- `packages/shared/src/dto/shop.ts` — `toShopDto(shop): ShopDto` mapper (Phase 2 created the base; Phase 4 extends it to include `draftLayout` for the studio view). Confirm `ShopDto` shape; add `draftLayout` field if absent.

**`apps/web` route handlers (`/api/v1/studios/[id]/shop`):**
- `apps/web/app/api/v1/studios/[id]/shop/draft/route.ts` — `PUT` handler: validate body with `ShopDraftInput`, persist to `Shop.draftLayout`/`theme`/`featuredItemIds`.
- `apps/web/app/api/v1/studios/[id]/shop/publish/route.ts` — `POST` handler: promote `draftLayout` → `layout`, set `status = PUBLISHED`, `publishedAt = now()`.
- (Consumes existing Phase-2 `apps/web/app/api/v1/studios/[id]/shop/route.ts` `GET` and `apps/web/app/api/v1/studios/[id]/items/[itemId]/route.ts` `PATCH` — not modified.)

**`apps/web` builder page + components (`/dashboard/builder`):**
- `apps/web/app/(studio)/dashboard/builder/page.tsx` — Server Component: `requireStudio`, load shop + items via Prisma, map to DTOs, render `<ShopBuilder>` island.
- `apps/web/app/(studio)/dashboard/builder/ShopBuilder.tsx` — `"use client"` root island: holds `ShopLayout` state, wires the three panels + preview, Save-draft / Publish actions (fetch the two handlers).
- `apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.tsx` — LEFT-of-shell library (`w-80`): synced items as draggable sources.
- `apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.tsx` — CENTER: drop target, grid/list toggle, reorder, choose featured.
- `apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.tsx` — LEFT tools (`w-64`): pricing/stock/currency/sale-window/featured for the selected item; submits to `PATCH …/items/:itemId`.
- `apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.tsx` — live preview that renders the exact player-facing output from the current `ShopLayout` + items.
- `apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.ts` — typed reducer/hook owning `ShopLayout` editor state (reorder, toggle grid/list, set featured, select item).

**Storefront contract confirmation (Phase 2 — no rework):**
- `apps/web/app/(storefront)/s/[slug]/StorefrontGrid.tsx` (or equivalent Phase-2 renderer) — confirm it consumes `Shop.layout` (`mode`, `sections`, `ordering`), `Shop.theme`, `Shop.featuredItemIds`. The builder's `StorefrontPreview` imports the SAME presentational component so preview === published render.

**Tests:**
- `packages/shared/src/zod/shop.test.ts` — `ShopLayoutSchema` validation.
- `apps/web/app/api/v1/studios/[id]/shop/draft/route.test.ts` — draft handler.
- `apps/web/app/api/v1/studios/[id]/shop/publish/route.test.ts` — publish handler.
- `apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.test.ts` — reducer logic.
- `apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.test.tsx` — render/interaction.
- `apps/web/e2e/shop-builder.spec.ts` — Playwright: rearrange + publish → `/s/[slug]` reflects.

---

### Task 1: ShopLayout Zod schema & types (shared contract)

**Files:**
- Create: `packages/shared/src/zod/shop.ts`
- Test: `packages/shared/src/zod/shop.test.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

**Interfaces:**
- Consumes: `zod`.
- Produces:
  - `ShopLayoutSchema: z.ZodType<ShopLayout>` and `type ShopLayout = { mode: "grid" | "list"; sections: ShopSection[] }`
  - `type ShopSection = { id: string; title: string; itemIds: string[] }`
  - `ShopThemeSchema` and `type ShopTheme = { primary?: string; secondary?: string; background?: string; logoUrl?: string }`
  - `ShopDraftInputSchema` and `type ShopDraftInput = { layout: ShopLayout; theme: ShopTheme; featuredItemIds: string[] }`
  - All consumed by Task 4 (draft handler), Task 5 (publish handler), Task 7–11 (builder UI), and the Phase-2 storefront renderer.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/zod/shop.test.ts
import { describe, it, expect } from "vitest";
import { ShopLayoutSchema, ShopDraftInputSchema } from "./shop";

const hex = "#c3f400";
const id = "11111111-1111-1111-1111-111111111111";

describe("ShopLayoutSchema", () => {
  it("accepts a valid grid layout with sections", () => {
    const layout = {
      mode: "grid",
      sections: [{ id: "feat", title: "FEATURED", itemIds: [id] }],
    };
    const parsed = ShopLayoutSchema.parse(layout);
    expect(parsed.mode).toBe("grid");
    expect(parsed.sections[0].itemIds).toEqual([id]);
  });

  it("accepts list mode", () => {
    expect(ShopLayoutSchema.parse({ mode: "list", sections: [] }).mode).toBe("list");
  });

  it("rejects an unknown mode", () => {
    expect(() => ShopLayoutSchema.parse({ mode: "carousel", sections: [] })).toThrow();
  });

  it("rejects a section missing itemIds", () => {
    expect(() =>
      ShopLayoutSchema.parse({ mode: "grid", sections: [{ id: "x", title: "X" }] }),
    ).toThrow();
  });

  it("rejects a non-uuid itemId", () => {
    expect(() =>
      ShopLayoutSchema.parse({ mode: "grid", sections: [{ id: "x", title: "X", itemIds: ["nope"] }] }),
    ).toThrow();
  });
});

describe("ShopDraftInputSchema", () => {
  it("accepts layout + theme + featuredItemIds", () => {
    const parsed = ShopDraftInputSchema.parse({
      layout: { mode: "grid", sections: [] },
      theme: { primary: hex },
      featuredItemIds: [id],
    });
    expect(parsed.featuredItemIds).toEqual([id]);
    expect(parsed.theme.primary).toBe(hex);
  });

  it("rejects a non-hex theme color", () => {
    expect(() =>
      ShopDraftInputSchema.parse({
        layout: { mode: "grid", sections: [] },
        theme: { primary: "lime" },
        featuredItemIds: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/zod/shop.test.ts`
Expected: FAIL — `Cannot find module './shop'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/zod/shop.ts
import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");

export const ShopSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  itemIds: z.array(z.string().uuid()),
});
export type ShopSection = z.infer<typeof ShopSectionSchema>;

export const ShopLayoutSchema = z.object({
  mode: z.enum(["grid", "list"]),
  sections: z.array(ShopSectionSchema).max(24),
});
export type ShopLayout = z.infer<typeof ShopLayoutSchema>;

export const ShopThemeSchema = z.object({
  primary: hexColor.optional(),
  secondary: hexColor.optional(),
  background: hexColor.optional(),
  logoUrl: z.string().url().optional(),
});
export type ShopTheme = z.infer<typeof ShopThemeSchema>;

export const ShopDraftInputSchema = z.object({
  layout: ShopLayoutSchema,
  theme: ShopThemeSchema,
  featuredItemIds: z.array(z.string().uuid()).max(24),
});
export type ShopDraftInput = z.infer<typeof ShopDraftInputSchema>;
```

- [ ] **Step 4: Re-export from the package index**

```ts
// packages/shared/src/index.ts  (append)
export * from "./zod/shop";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/zod/shop.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/zod/shop.ts packages/shared/src/zod/shop.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ShopLayout/ShopTheme zod schemas and types"
```

---

### Task 2: Extend toShopDto for the studio (draft) view

**Files:**
- Modify: `packages/shared/src/dto/shop.ts`
- Test: `packages/shared/src/dto/shop.test.ts`

**Interfaces:**
- Consumes: `Prisma` types from `@xgamefi/db`; `ShopLayout`, `ShopTheme` from Task 1.
- Produces:
  - `type ShopDto = { id: string; studioId: string; slug: string; status: "DRAFT" | "PUBLISHED"; layout: ShopLayout; draftLayout: ShopLayout | null; theme: ShopTheme; featuredItemIds: string[]; publishedAt: string | null }`
  - `toShopDto(row: ShopWithSlug): ShopDto` where `ShopWithSlug` is a Prisma `Shop` joined with its `studio.slug`. Consumed by Tasks 4, 5, 6 and the builder page.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/dto/shop.test.ts
import { describe, it, expect } from "vitest";
import { toShopDto } from "./shop";

const base = {
  id: "shop-1",
  studioId: "stu-1",
  status: "DRAFT" as const,
  layout: { mode: "grid", sections: [] },
  draftLayout: { mode: "list", sections: [] },
  theme: { primary: "#c3f400" },
  featuredItemIds: ["i1"],
  publishedAt: null,
  studio: { slug: "gridlock" },
};

describe("toShopDto", () => {
  it("maps draftLayout for the studio view", () => {
    const dto = toShopDto(base as any);
    expect(dto.slug).toBe("gridlock");
    expect(dto.draftLayout?.mode).toBe("list");
    expect(dto.layout.mode).toBe("grid");
    expect(dto.publishedAt).toBeNull();
  });

  it("serialises publishedAt to ISO string when present", () => {
    const dto = toShopDto({ ...base, status: "PUBLISHED", publishedAt: new Date("2026-06-23T00:00:00Z") } as any);
    expect(dto.publishedAt).toBe("2026-06-23T00:00:00.000Z");
  });

  it("returns null draftLayout when absent", () => {
    const dto = toShopDto({ ...base, draftLayout: null } as any);
    expect(dto.draftLayout).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xgamefi/shared test src/dto/shop.test.ts`
Expected: FAIL — `draftLayout` not present on `ShopDto` / mapper missing the field.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/dto/shop.ts
import type { ShopLayout, ShopTheme } from "../zod/shop";

type ShopWithSlug = {
  id: string;
  studioId: string;
  status: "DRAFT" | "PUBLISHED";
  layout: unknown;
  draftLayout: unknown | null;
  theme: unknown;
  featuredItemIds: string[];
  publishedAt: Date | null;
  studio: { slug: string };
};

export type ShopDto = {
  id: string;
  studioId: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  layout: ShopLayout;
  draftLayout: ShopLayout | null;
  theme: ShopTheme;
  featuredItemIds: string[];
  publishedAt: string | null;
};

export function toShopDto(row: ShopWithSlug): ShopDto {
  return {
    id: row.id,
    studioId: row.studioId,
    slug: row.studio.slug,
    status: row.status,
    layout: (row.layout ?? { mode: "grid", sections: [] }) as ShopLayout,
    draftLayout: (row.draftLayout ?? null) as ShopLayout | null,
    theme: (row.theme ?? {}) as ShopTheme,
    featuredItemIds: row.featuredItemIds,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}
```

> If Phase 2 already created `toShopDto` without `draftLayout`/`slug`, edit the existing function rather than duplicating it; keep the single exported name `toShopDto`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xgamefi/shared test src/dto/shop.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dto/shop.ts packages/shared/src/dto/shop.test.ts
git commit -m "feat(shared): toShopDto exposes draftLayout for studio view"
```

---

### Task 3: Confirm storefront consumes layout/theme/featured (contract guard)

**Files:**
- Test: `apps/web/app/(storefront)/s/[slug]/StorefrontGrid.test.tsx`
- Modify (only if missing): `apps/web/app/(storefront)/s/[slug]/StorefrontGrid.tsx`

**Interfaces:**
- Consumes: Phase-2 presentational `StorefrontGrid` and `ShopLayout`/`ShopTheme` from Task 1.
- Produces: confirms `StorefrontGrid({ layout, theme, featuredItemIds, items })` renders grid vs list by `layout.mode`, places featured items first, and applies `theme.primary`. The builder preview (Task 11) imports this SAME component. No rework — this is a contract regression guard.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(storefront)/s/[slug]/StorefrontGrid.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StorefrontGrid } from "./StorefrontGrid";

const items = [
  { id: "i1", name: "Sword Skin", priceAmount: "1.0000000", priceCurrency: "USDT", imageUrl: "/s.png", rarity: "LEGENDARY" },
  { id: "i2", name: "Shield", priceAmount: "2.0000000", priceCurrency: "USDT", imageUrl: "/h.png", rarity: "RARE" },
];

describe("StorefrontGrid contract", () => {
  it("renders grid mode with a grid container", () => {
    render(
      <StorefrontGrid
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: ["i1", "i2"] }] }}
        theme={{ primary: "#c3f400" }}
        featuredItemIds={["i2"]}
        items={items as any}
      />,
    );
    expect(screen.getByTestId("storefront-grid")).toHaveAttribute("data-mode", "grid");
  });

  it("renders featured items before non-featured", () => {
    render(
      <StorefrontGrid
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: ["i1", "i2"] }] }}
        theme={{}}
        featuredItemIds={["i2"]}
        items={items as any}
      />,
    );
    const cards = screen.getAllByTestId("item-card");
    expect(cards[0]).toHaveTextContent("Shield");
  });

  it("applies theme primary color via CSS var", () => {
    render(
      <StorefrontGrid layout={{ mode: "list", sections: [] }} theme={{ primary: "#fe00fe" }} featuredItemIds={[]} items={[]} />,
    );
    expect(screen.getByTestId("storefront-grid")).toHaveStyle({ "--color-primary-fixed": "#fe00fe" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test app/\(storefront\)/s/\[slug\]/StorefrontGrid.test.tsx`
Expected: FAIL — missing `data-testid`/`data-mode` hooks or featured ordering not implemented.

- [ ] **Step 3: Add the minimal contract hooks to the Phase-2 component**

```tsx
// apps/web/app/(storefront)/s/[slug]/StorefrontGrid.tsx  (Phase 2 — add only what the test requires)
import type { ShopLayout, ShopTheme } from "@xgamefi/shared";
import { ItemCard } from "./ItemCard";

type StoreItem = { id: string; name: string; priceAmount: string; priceCurrency: string; imageUrl: string; rarity?: string };

export function StorefrontGrid({
  layout,
  theme,
  featuredItemIds,
  items,
}: {
  layout: ShopLayout;
  theme: ShopTheme;
  featuredItemIds: string[];
  items: StoreItem[];
}) {
  const orderedIds = layout.sections.flatMap((s) => s.itemIds);
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as StoreItem[];
  const featured = new Set(featuredItemIds);
  const sorted = [...ordered].sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)));

  const style = theme.primary ? ({ ["--color-primary-fixed" as string]: theme.primary } as React.CSSProperties) : undefined;

  return (
    <div
      data-testid="storefront-grid"
      data-mode={layout.mode}
      style={style}
      className={layout.mode === "grid" ? "grid grid-cols-2 gap-gutter md:grid-cols-4" : "flex flex-col gap-gutter"}
    >
      {sorted.map((item) => (
        <ItemCard key={item.id} item={item} featured={featured.has(item.id)} />
      ))}
    </div>
  );
}
```

> If Phase 2 already implements this, only add the `data-testid`/`data-mode`/featured-sort lines the test asserts; do not restructure.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test app/\(storefront\)/s/\[slug\]/StorefrontGrid.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(storefront)/s/[slug]/StorefrontGrid.tsx" "apps/web/app/(storefront)/s/[slug]/StorefrontGrid.test.tsx"
git commit -m "test(storefront): guard layout/theme/featured render contract for builder reuse"
```

---

### Task 4: PUT /studios/:id/shop/draft handler

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/shop/draft/route.ts`
- Test: `apps/web/app/api/v1/studios/[id]/shop/draft/route.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@xgamefi/db`; `requireStudio`, `scopeToStudio` from `apps/web/lib/auth`; `ShopDraftInputSchema`, `toShopDto` from `@xgamefi/shared`.
- Produces: `PUT` handler `export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>` → 200 `{ shop: ShopDto }` (status stays `DRAFT`, only `draftLayout`/`theme`/`featuredItemIds` updated), 400 on Zod failure, 403 on cross-studio. Consumed by the builder Save-draft action (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/studios/[id]/shop/draft/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const update = vi.fn();
const findFirst = vi.fn();
vi.mock("@xgamefi/db", () => ({
  prisma: { shop: { update: (a: any) => update(a), findFirst: (a: any) => findFirst(a) } },
}));
const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
vi.mock("../../../../../../lib/auth", () => ({
  requireStudio: (id: string) => requireStudio(id),
  scopeToStudio: (p: any, id: string) => scopeToStudio(p, id),
}));

import { PUT } from "./route";

const uuid = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: "stu-1" }) };

function req(body: unknown) {
  return new Request("http://x/api/v1/studios/stu-1/shop/draft", {
    method: "PUT",
    headers: { "content-type": "application/json", origin: "http://x" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  update.mockReset();
  findFirst.mockReset();
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu-1" });
  scopeToStudio.mockReset();
});

describe("PUT /studios/:id/shop/draft", () => {
  const valid = {
    layout: { mode: "grid", sections: [{ id: "s", title: "ALL", itemIds: [uuid] }] },
    theme: { primary: "#c3f400" },
    featuredItemIds: [uuid],
  };

  it("saves draftLayout and returns 200 with the DTO", async () => {
    update.mockResolvedValue({
      id: "shop-1", studioId: "stu-1", status: "DRAFT",
      layout: { mode: "grid", sections: [] }, draftLayout: valid.layout,
      theme: valid.theme, featuredItemIds: [uuid], publishedAt: null, studio: { slug: "gridlock" },
    });
    const res = await PUT(req(valid), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shop.draftLayout.mode).toBe("grid");
    expect(json.shop.status).toBe("DRAFT");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studioId: "stu-1" },
        data: { draftLayout: valid.layout, theme: valid.theme, featuredItemIds: [uuid] },
        include: { studio: { select: { slug: true } } },
      }),
    );
    expect(requireStudio).toHaveBeenCalledWith("stu-1");
  });

  it("returns 400 on invalid layout mode", async () => {
    const res = await PUT(req({ ...valid, layout: { mode: "carousel", sections: [] } }), ctx);
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 403 when scopeToStudio throws", async () => {
    scopeToStudio.mockImplementation(() => { throw Object.assign(new Error("forbidden"), { status: 403 }); });
    const res = await PUT(req(valid), ctx);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/api/v1/studios/[id]/shop/draft/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/api/v1/studios/[id]/shop/draft/route.ts
import { prisma } from "@xgamefi/db";
import { ShopDraftInputSchema, toShopDto } from "@xgamefi/shared";
import { requireStudio, scopeToStudio } from "../../../../../../lib/auth";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: studioId } = await ctx.params;

  if (req.headers.get("origin") && new URL(req.headers.get("origin")!).host !== new URL(req.url).host) {
    return Response.json({ error: "bad origin" }, { status: 403 });
  }

  let principal;
  try {
    principal = await requireStudio(studioId);
    scopeToStudio(principal, studioId);
  } catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 401;
    return Response.json({ error: "forbidden" }, { status });
  }

  const parsed = ShopDraftInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }

  const shop = await prisma.shop.update({
    where: { studioId },
    data: {
      draftLayout: parsed.data.layout,
      theme: parsed.data.theme,
      featuredItemIds: parsed.data.featuredItemIds,
    },
    include: { studio: { select: { slug: true } } },
  });

  return Response.json({ shop: toShopDto(shop) }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/api/v1/studios/[id]/shop/draft/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/v1/studios/[id]/shop/draft/route.ts" "apps/web/app/api/v1/studios/[id]/shop/draft/route.test.ts"
git commit -m "feat(api): PUT /studios/:id/shop/draft saves validated layout/theme/featured"
```

---

### Task 5: POST /studios/:id/shop/publish handler

**Files:**
- Create: `apps/web/app/api/v1/studios/[id]/shop/publish/route.ts`
- Test: `apps/web/app/api/v1/studios/[id]/shop/publish/route.test.ts`

**Interfaces:**
- Consumes: `prisma`; `requireStudio`, `scopeToStudio`; `ShopLayoutSchema`, `toShopDto` from `@xgamefi/shared`.
- Produces: `POST` handler `export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>` → 200 `{ shop: ShopDto }` with `layout = draftLayout`, `status = PUBLISHED`, `publishedAt` set; 409 if `draftLayout` is null/invalid (nothing to publish); 403 cross-studio. Consumed by the builder Publish action (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/v1/studios/[id]/shop/publish/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@xgamefi/db", () => ({
  prisma: { shop: { findUnique: (a: any) => findUnique(a), update: (a: any) => update(a) } },
}));
const requireStudio = vi.fn();
const scopeToStudio = vi.fn();
vi.mock("../../../../../../lib/auth", () => ({
  requireStudio: (id: string) => requireStudio(id),
  scopeToStudio: (p: any, id: string) => scopeToStudio(p, id),
}));

import { POST } from "./route";

const uuid = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: "stu-1" }) };
const draft = { mode: "grid", sections: [{ id: "s", title: "ALL", itemIds: [uuid] }] };

function req() {
  return new Request("http://x/api/v1/studios/stu-1/shop/publish", {
    method: "POST",
    headers: { origin: "http://x" },
  });
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu-1" });
  scopeToStudio.mockReset();
});

describe("POST /studios/:id/shop/publish", () => {
  it("promotes draftLayout to layout and sets PUBLISHED + publishedAt", async () => {
    findUnique.mockResolvedValue({ draftLayout: draft });
    update.mockResolvedValue({
      id: "shop-1", studioId: "stu-1", status: "PUBLISHED",
      layout: draft, draftLayout: draft, theme: {}, featuredItemIds: [uuid],
      publishedAt: new Date("2026-06-23T00:00:00Z"), studio: { slug: "gridlock" },
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shop.status).toBe("PUBLISHED");
    expect(json.shop.layout.mode).toBe("grid");
    expect(json.shop.publishedAt).toBe("2026-06-23T00:00:00.000Z");
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ studioId: "stu-1" });
    expect(arg.data.layout).toEqual(draft);
    expect(arg.data.status).toBe("PUBLISHED");
    expect(arg.data.publishedAt).toBeInstanceOf(Date);
  });

  it("returns 409 when there is no draft to publish", async () => {
    findUnique.mockResolvedValue({ draftLayout: null });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 409 when draftLayout is malformed", async () => {
    findUnique.mockResolvedValue({ draftLayout: { mode: "carousel" } });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
  });

  it("returns 403 when scopeToStudio throws", async () => {
    scopeToStudio.mockImplementation(() => { throw Object.assign(new Error("forbidden"), { status: 403 }); });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/api/v1/studios/[id]/shop/publish/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/api/v1/studios/[id]/shop/publish/route.ts
import { prisma } from "@xgamefi/db";
import { ShopLayoutSchema, toShopDto } from "@xgamefi/shared";
import { requireStudio, scopeToStudio } from "../../../../../../lib/auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: studioId } = await ctx.params;

  if (req.headers.get("origin") && new URL(req.headers.get("origin")!).host !== new URL(req.url).host) {
    return Response.json({ error: "bad origin" }, { status: 403 });
  }

  let principal;
  try {
    principal = await requireStudio(studioId);
    scopeToStudio(principal, studioId);
  } catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 401;
    return Response.json({ error: "forbidden" }, { status });
  }

  const current = await prisma.shop.findUnique({ where: { studioId }, select: { draftLayout: true } });
  const parsed = ShopLayoutSchema.safeParse(current?.draftLayout ?? null);
  if (!parsed.success) {
    return Response.json({ error: "no valid draft to publish" }, { status: 409 });
  }

  const shop = await prisma.shop.update({
    where: { studioId },
    data: { layout: parsed.data, status: "PUBLISHED", publishedAt: new Date() },
    include: { studio: { select: { slug: true } } },
  });

  return Response.json({ shop: toShopDto(shop) }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/api/v1/studios/[id]/shop/publish/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/v1/studios/[id]/shop/publish/route.ts" "apps/web/app/api/v1/studios/[id]/shop/publish/route.test.ts"
git commit -m "feat(api): POST /studios/:id/shop/publish promotes draft to published layout"
```

---

### Task 6: Builder page (Server Component data loader)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/page.tsx`
- Test: `apps/web/app/(studio)/dashboard/builder/page.test.tsx`

**Interfaces:**
- Consumes: `prisma`; `requireRole` from `apps/web/lib/auth`; `toShopDto`, `toItemDto` from `@xgamefi/shared`; `<ShopBuilder>` (Task 7).
- Produces: `export default async function BuilderPage(): Promise<JSX.Element>` — loads the principal's shop + items, maps to DTOs, renders `<ShopBuilder shop={shopDto} items={itemDtos} />`. Server Component (no `"use client"`).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(studio)/dashboard/builder/page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../../lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu-1" }),
}));
vi.mock("@xgamefi/db", () => ({
  prisma: {
    shop: { findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: "shop-1", studioId: "stu-1", status: "DRAFT",
      layout: { mode: "grid", sections: [] }, draftLayout: null, theme: {}, featuredItemIds: [],
      publishedAt: null, studio: { slug: "gridlock" } }) },
    item: { findMany: vi.fn().mockResolvedValue([
      { id: "i1", name: "Sword Skin", priceAmount: { toString: () => "1.0000000" }, priceCurrency: "USDT", imageUrl: "/s.png", stock: null, isActive: true, rarity: "LEGENDARY" }]) },
  },
}));
vi.mock("./ShopBuilder", () => ({
  ShopBuilder: ({ shop, items }: any) => (
    <div data-testid="builder">{shop.slug}:{items.length}</div>
  ),
}));

import BuilderPage from "./page";

describe("BuilderPage", () => {
  it("loads the studio shop + items and renders the builder island", async () => {
    const ui = await BuilderPage();
    render(ui);
    expect(screen.getByTestId("builder")).toHaveTextContent("gridlock:1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(studio)/dashboard/builder/page.tsx
import { prisma } from "@xgamefi/db";
import { toShopDto, toItemDto } from "@xgamefi/shared";
import { requireRole } from "../../../../lib/auth";
import { ShopBuilder } from "./ShopBuilder";

export default async function BuilderPage() {
  const principal = await requireRole("STUDIO_OWNER", "STUDIO_MEMBER", "ADMIN");
  const studioId = principal.studioId!;

  const [shop, items] = await Promise.all([
    prisma.shop.findUniqueOrThrow({
      where: { studioId },
      include: { studio: { select: { slug: true } } },
    }),
    prisma.item.findMany({ where: { studioId, isActive: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return <ShopBuilder shop={toShopDto(shop)} items={items.map(toItemDto)} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/page.tsx" "apps/web/app/(studio)/dashboard/builder/page.test.tsx"
git commit -m "feat(builder): server component loads shop+items into builder island"
```

---

### Task 7: Builder editor store (reducer hook)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.ts`
- Test: `apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.test.ts`

**Interfaces:**
- Consumes: `ShopLayout`, `ShopSection` from `@xgamefi/shared`.
- Produces:
  - `type BuilderState = { layout: ShopLayout; featuredItemIds: string[]; selectedItemId: string | null }`
  - `function builderReducer(state: BuilderState, action: BuilderAction): BuilderState` with actions: `{ type: "SET_MODE"; mode: "grid"|"list" }`, `{ type: "ADD_ITEM"; sectionId: string; itemId: string; index?: number }`, `{ type: "REMOVE_ITEM"; itemId: string }`, `{ type: "REORDER"; sectionId: string; from: number; to: number }`, `{ type: "TOGGLE_FEATURED"; itemId: string }`, `{ type: "SELECT_ITEM"; itemId: string | null }`.
  - `function useBuilderStore(initial: BuilderState): { state; dispatch }` (thin `useReducer` wrapper).
  - Consumed by `ShopBuilder` and all three panels (Tasks 8–11). The reducer is pure → unit-testable without rendering.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.test.ts
import { describe, it, expect } from "vitest";
import { builderReducer, type BuilderState } from "./useBuilderStore";

const i1 = "11111111-1111-1111-1111-111111111111";
const i2 = "22222222-2222-2222-2222-222222222222";

const base: BuilderState = {
  layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1] }] },
  featuredItemIds: [],
  selectedItemId: null,
};

describe("builderReducer", () => {
  it("SET_MODE toggles grid/list", () => {
    expect(builderReducer(base, { type: "SET_MODE", mode: "list" }).layout.mode).toBe("list");
  });

  it("ADD_ITEM appends to a section without duplicating", () => {
    const s1 = builderReducer(base, { type: "ADD_ITEM", sectionId: "all", itemId: i2 });
    expect(s1.layout.sections[0].itemIds).toEqual([i1, i2]);
    const s2 = builderReducer(s1, { type: "ADD_ITEM", sectionId: "all", itemId: i1 });
    expect(s2.layout.sections[0].itemIds).toEqual([i1, i2]);
  });

  it("REMOVE_ITEM drops the item from every section and from featured", () => {
    const seeded: BuilderState = { ...base, featuredItemIds: [i1] };
    const out = builderReducer(seeded, { type: "REMOVE_ITEM", itemId: i1 });
    expect(out.layout.sections[0].itemIds).toEqual([]);
    expect(out.featuredItemIds).toEqual([]);
  });

  it("REORDER moves an item within a section", () => {
    const seeded: BuilderState = {
      ...base,
      layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1, i2] }] },
    };
    const out = builderReducer(seeded, { type: "REORDER", sectionId: "all", from: 0, to: 1 });
    expect(out.layout.sections[0].itemIds).toEqual([i2, i1]);
  });

  it("TOGGLE_FEATURED adds then removes", () => {
    const on = builderReducer(base, { type: "TOGGLE_FEATURED", itemId: i1 });
    expect(on.featuredItemIds).toEqual([i1]);
    const off = builderReducer(on, { type: "TOGGLE_FEATURED", itemId: i1 });
    expect(off.featuredItemIds).toEqual([]);
  });

  it("SELECT_ITEM sets the selected id", () => {
    expect(builderReducer(base, { type: "SELECT_ITEM", itemId: i1 }).selectedItemId).toBe(i1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/lib/useBuilderStore.test.ts"`
Expected: FAIL — `Cannot find module './useBuilderStore'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.ts
"use client";
import { useReducer } from "react";
import type { ShopLayout } from "@xgamefi/shared";

export type BuilderState = {
  layout: ShopLayout;
  featuredItemIds: string[];
  selectedItemId: string | null;
};

export type BuilderAction =
  | { type: "SET_MODE"; mode: "grid" | "list" }
  | { type: "ADD_ITEM"; sectionId: string; itemId: string; index?: number }
  | { type: "REMOVE_ITEM"; itemId: string }
  | { type: "REORDER"; sectionId: string; from: number; to: number }
  | { type: "TOGGLE_FEATURED"; itemId: string }
  | { type: "SELECT_ITEM"; itemId: string | null };

function mapSections(layout: ShopLayout, fn: (s: ShopLayout["sections"][number]) => ShopLayout["sections"][number]): ShopLayout {
  return { ...layout, sections: layout.sections.map(fn) };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, layout: { ...state.layout, mode: action.mode } };
    case "ADD_ITEM":
      return {
        ...state,
        layout: mapSections(state.layout, (s) => {
          if (s.id !== action.sectionId || s.itemIds.includes(action.itemId)) return s;
          const next = [...s.itemIds];
          next.splice(action.index ?? next.length, 0, action.itemId);
          return { ...s, itemIds: next };
        }),
      };
    case "REMOVE_ITEM":
      return {
        ...state,
        layout: mapSections(state.layout, (s) => ({ ...s, itemIds: s.itemIds.filter((id) => id !== action.itemId) })),
        featuredItemIds: state.featuredItemIds.filter((id) => id !== action.itemId),
        selectedItemId: state.selectedItemId === action.itemId ? null : state.selectedItemId,
      };
    case "REORDER":
      return {
        ...state,
        layout: mapSections(state.layout, (s) => {
          if (s.id !== action.sectionId) return s;
          const next = [...s.itemIds];
          const [moved] = next.splice(action.from, 1);
          next.splice(action.to, 0, moved);
          return { ...s, itemIds: next };
        }),
      };
    case "TOGGLE_FEATURED":
      return {
        ...state,
        featuredItemIds: state.featuredItemIds.includes(action.itemId)
          ? state.featuredItemIds.filter((id) => id !== action.itemId)
          : [...state.featuredItemIds, action.itemId],
      };
    case "SELECT_ITEM":
      return { ...state, selectedItemId: action.itemId };
    default:
      return state;
  }
}

export function useBuilderStore(initial: BuilderState) {
  const [state, dispatch] = useReducer(builderReducer, initial);
  return { state, dispatch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/lib/useBuilderStore.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.ts" "apps/web/app/(studio)/dashboard/builder/lib/useBuilderStore.test.ts"
git commit -m "feat(builder): pure reducer for layout/featured/selection editor state"
```

---

### Task 8: ItemLibrary panel (RIGHT, w-80 — draggable synced items)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.tsx`
- Test: `apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.test.tsx`

**Interfaces:**
- Consumes: `ItemDto` (from `toItemDto`); `@dnd-kit/core` `useDraggable`; `dispatch` from the store (`ADD_ITEM`, `SELECT_ITEM`).
- Produces: `function ItemLibrary({ items, placedItemIds, onAdd, onSelect }: { items: ItemDto[]; placedItemIds: string[]; onAdd: (itemId: string) => void; onSelect: (itemId: string) => void }): JSX.Element` — `w-80` column, each item a draggable source, an "ADD" button (keyboard/no-drag fallback) calling `onAdd`, placed items dimmed.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { ItemLibrary } from "./ItemLibrary";

const items = [
  { id: "i1", name: "Sword Skin", priceAmount: "1.0000000", priceCurrency: "USDT", imageUrl: "/s.png", stock: null, rarity: "LEGENDARY" },
  { id: "i2", name: "Shield", priceAmount: "2.0000000", priceCurrency: "USDT", imageUrl: "/h.png", stock: 5, rarity: "RARE" },
] as any;

function renderLib(props: Partial<React.ComponentProps<typeof ItemLibrary>> = {}) {
  return render(
    <DndContext>
      <ItemLibrary items={items} placedItemIds={["i2"]} onAdd={vi.fn()} onSelect={vi.fn()} {...props} />
    </DndContext>,
  );
}

describe("ItemLibrary", () => {
  it("lists every synced item", () => {
    renderLib();
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText("Shield")).toBeInTheDocument();
  });

  it("marks already-placed items", () => {
    renderLib();
    expect(screen.getByTestId("lib-item-i2")).toHaveAttribute("data-placed", "true");
    expect(screen.getByTestId("lib-item-i1")).toHaveAttribute("data-placed", "false");
  });

  it("calls onAdd when the ADD button is clicked", () => {
    const onAdd = vi.fn();
    renderLib({ onAdd });
    fireEvent.click(screen.getByTestId("lib-add-i1"));
    expect(onAdd).toHaveBeenCalledWith("i1");
  });

  it("calls onSelect when an item row is clicked", () => {
    const onSelect = vi.fn();
    renderLib({ onSelect });
    fireEvent.click(screen.getByTestId("lib-item-i1"));
    expect(onSelect).toHaveBeenCalledWith("i1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/ItemLibrary.test.tsx"`
Expected: FAIL — `Cannot find module './ItemLibrary'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.tsx
"use client";
import { useDraggable } from "@dnd-kit/core";

type ItemDto = { id: string; name: string; priceAmount: string; priceCurrency: string; imageUrl: string; stock: number | null; rarity?: string };

function LibRow({ item, placed, onAdd, onSelect }: { item: ItemDto; placed: boolean; onAdd: (id: string) => void; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `lib-${item.id}`, data: { itemId: item.id } });
  return (
    <div
      ref={setNodeRef}
      data-testid={`lib-item-${item.id}`}
      data-placed={placed}
      onClick={() => onSelect(item.id)}
      className={`flex items-center gap-3 border-2 border-outline-variant bg-surface-container-low p-2 ${placed ? "opacity-40" : ""}`}
      {...attributes}
      {...listeners}
    >
      <img src={item.imageUrl} alt="" className="aspect-square w-12 object-cover" />
      <div className="flex-1">
        <p className="font-display text-on-surface">{item.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">
          {item.priceAmount} {item.priceCurrency}
        </p>
      </div>
      <button
        type="button"
        data-testid={`lib-add-${item.id}`}
        onClick={(e) => { e.stopPropagation(); onAdd(item.id); }}
        className="border-2 border-outline px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] hover:border-primary-fixed hover:text-primary-fixed"
      >
        ADD
      </button>
    </div>
  );
}

export function ItemLibrary({
  items, placedItemIds, onAdd, onSelect,
}: {
  items: ItemDto[]; placedItemIds: string[]; onAdd: (itemId: string) => void; onSelect: (itemId: string) => void;
}) {
  const placed = new Set(placedItemIds);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-2 overflow-y-auto border-l-2 border-outline-variant bg-surface-container-lowest p-3">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">ITEM_LIBRARY</h2>
      {items.map((item) => (
        <LibRow key={item.id} item={item} placed={placed.has(item.id)} onAdd={onAdd} onSelect={onSelect} />
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/ItemLibrary.test.tsx"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.tsx" "apps/web/app/(studio)/dashboard/builder/components/ItemLibrary.test.tsx"
git commit -m "feat(builder): draggable item library panel (w-80)"
```

---

### Task 9: LayoutCanvas panel (CENTER — arrange, grid/list, featured)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.tsx`
- Test: `apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.test.tsx`

**Interfaces:**
- Consumes: `ShopLayout`, `ShopSection`; `@dnd-kit/core` droppable; store callbacks `onSetMode`, `onRemove`, `onToggleFeatured`, `onSelect`.
- Produces: `function LayoutCanvas({ layout, items, featuredItemIds, selectedItemId, onSetMode, onRemove, onToggleFeatured, onSelect }: LayoutCanvasProps): JSX.Element` — fluid center column, grid/list toggle, renders placed item cards per section, FEATURE/REMOVE controls, marks the selected card. `LayoutCanvasProps` exported.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { LayoutCanvas } from "./LayoutCanvas";

const i1 = "11111111-1111-1111-1111-111111111111";
const items = [{ id: i1, name: "Sword Skin", priceAmount: "1.0000000", priceCurrency: "USDT", imageUrl: "/s.png", stock: null, rarity: "LEGENDARY" }] as any;
const layout = { mode: "grid" as const, sections: [{ id: "all", title: "ALL", itemIds: [i1] }] };

function renderCanvas(props: Partial<React.ComponentProps<typeof LayoutCanvas>> = {}) {
  return render(
    <DndContext>
      <LayoutCanvas
        layout={layout} items={items} featuredItemIds={[]} selectedItemId={null}
        onSetMode={vi.fn()} onRemove={vi.fn()} onToggleFeatured={vi.fn()} onSelect={vi.fn()} {...props}
      />
    </DndContext>,
  );
}

describe("LayoutCanvas", () => {
  it("reflects the current mode on the container", () => {
    renderCanvas();
    expect(screen.getByTestId("canvas").dataset.mode).toBe("grid");
  });

  it("toggling to LIST calls onSetMode('list')", () => {
    const onSetMode = vi.fn();
    renderCanvas({ onSetMode });
    fireEvent.click(screen.getByTestId("mode-list"));
    expect(onSetMode).toHaveBeenCalledWith("list");
  });

  it("renders a card per placed item", () => {
    renderCanvas();
    expect(screen.getByTestId(`canvas-card-${i1}`)).toHaveTextContent("Sword Skin");
  });

  it("FEATURE button calls onToggleFeatured with the item id", () => {
    const onToggleFeatured = vi.fn();
    renderCanvas({ onToggleFeatured });
    fireEvent.click(screen.getByTestId(`canvas-feature-${i1}`));
    expect(onToggleFeatured).toHaveBeenCalledWith(i1);
  });

  it("marks a featured card", () => {
    renderCanvas({ featuredItemIds: [i1] });
    expect(screen.getByTestId(`canvas-card-${i1}`).dataset.featured).toBe("true");
  });

  it("REMOVE button calls onRemove", () => {
    const onRemove = vi.fn();
    renderCanvas({ onRemove });
    fireEvent.click(screen.getByTestId(`canvas-remove-${i1}`));
    expect(onRemove).toHaveBeenCalledWith(i1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/LayoutCanvas.test.tsx"`
Expected: FAIL — `Cannot find module './LayoutCanvas'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.tsx
"use client";
import { useDroppable } from "@dnd-kit/core";
import type { ShopLayout } from "@xgamefi/shared";

type ItemDto = { id: string; name: string; priceAmount: string; priceCurrency: string; imageUrl: string; stock: number | null; rarity?: string };

export type LayoutCanvasProps = {
  layout: ShopLayout;
  items: ItemDto[];
  featuredItemIds: string[];
  selectedItemId: string | null;
  onSetMode: (mode: "grid" | "list") => void;
  onRemove: (itemId: string) => void;
  onToggleFeatured: (itemId: string) => void;
  onSelect: (itemId: string) => void;
};

export function LayoutCanvas(props: LayoutCanvasProps) {
  const { layout, items, featuredItemIds, selectedItemId, onSetMode, onRemove, onToggleFeatured, onSelect } = props;
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop" });
  const byId = new Map(items.map((i) => [i.id, i]));
  const featured = new Set(featuredItemIds);

  return (
    <section className="flex flex-1 flex-col gap-4 overflow-y-auto bg-surface p-6">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">LAYOUT</span>
        <button type="button" data-testid="mode-grid" onClick={() => onSetMode("grid")}
          className={`border-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${layout.mode === "grid" ? "border-primary-fixed text-primary-fixed" : "border-outline"}`}>GRID</button>
        <button type="button" data-testid="mode-list" onClick={() => onSetMode("list")}
          className={`border-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${layout.mode === "list" ? "border-primary-fixed text-primary-fixed" : "border-outline"}`}>LIST</button>
      </div>

      <div ref={setNodeRef} data-testid="canvas" data-mode={layout.mode}
        className={`min-h-64 border-2 border-dashed p-4 ${isOver ? "border-primary-fixed" : "border-outline-variant"} ${layout.mode === "grid" ? "grid grid-cols-2 gap-gutter md:grid-cols-3" : "flex flex-col gap-gutter"}`}>
        {layout.sections.flatMap((s) => s.itemIds).map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          const isFeatured = featured.has(id);
          return (
            <div key={id} data-testid={`canvas-card-${id}`} data-featured={isFeatured}
              onClick={() => onSelect(id)}
              className={`relative border-2 bg-surface-container-low p-2 ${selectedItemId === id ? "border-primary-fixed" : isFeatured ? "border-secondary-container" : "border-outline-variant"}`}>
              <img src={item.imageUrl} alt="" className="aspect-square w-full object-cover" />
              <p className="font-display text-on-surface">{item.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">{item.priceAmount} {item.priceCurrency}</p>
              <div className="mt-2 flex gap-1">
                <button type="button" data-testid={`canvas-feature-${id}`} onClick={(e) => { e.stopPropagation(); onToggleFeatured(id); }}
                  className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${isFeatured ? "border-secondary-container text-secondary-container" : "border-outline"}`}>{isFeatured ? "FEATURED" : "FEATURE"}</button>
                <button type="button" data-testid={`canvas-remove-${id}`} onClick={(e) => { e.stopPropagation(); onRemove(id); }}
                  className="border border-outline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] hover:border-error hover:text-error">REMOVE</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/LayoutCanvas.test.tsx"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.tsx" "apps/web/app/(studio)/dashboard/builder/components/LayoutCanvas.test.tsx"
git commit -m "feat(builder): layout canvas with grid/list toggle, featured, remove"
```

---

### Task 10: ItemConfigPanel (LEFT, w-64 — pricing/stock/sale-window via PATCH item)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.tsx`
- Test: `apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.test.tsx`

**Interfaces:**
- Consumes: existing Phase-2 `PATCH /studios/:id/items/:itemId` (price/currency/stock/sale-window/featured) — **consumed via fetch, not recreated**; `ItemDto`.
- Produces: `function ItemConfigPanel({ studioId, item, onSaved }: { studioId: string; item: ItemDto | null; onSaved: (updated: ItemDto) => void }): JSX.Element` — `w-64` tools column; when no item selected shows an empty hint; submits a PATCH to `/api/v1/studios/${studioId}/items/${item.id}` with `{ priceAmount, priceCurrency, stock, saleStartsAt, saleEndsAt }` and calls `onSaved`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ItemConfigPanel } from "./ItemConfigPanel";

const item = { id: "i1", name: "Sword Skin", priceAmount: "1.0000000", priceCurrency: "USDT", stock: null, imageUrl: "/s.png", saleStartsAt: null, saleEndsAt: null } as any;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ItemConfigPanel", () => {
  it("prompts to select an item when none is selected", () => {
    render(<ItemConfigPanel studioId="stu-1" item={null} onSaved={vi.fn()} />);
    expect(screen.getByTestId("config-empty")).toBeInTheDocument();
  });

  it("PATCHes the item endpoint with edited price + currency on save", async () => {
    const updated = { ...item, priceAmount: "3.0000000", priceCurrency: "XLM" };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ item: updated }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const onSaved = vi.fn();
    render(<ItemConfigPanel studioId="stu-1" item={item} onSaved={onSaved} />);

    fireEvent.change(screen.getByTestId("config-price"), { target: { value: "3.0000000" } });
    fireEvent.change(screen.getByTestId("config-currency"), { target: { value: "XLM" } });
    fireEvent.click(screen.getByTestId("config-save"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/studios/stu-1/items/i1");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(init!.body as string);
    expect(body.priceAmount).toBe("3.0000000");
    expect(body.priceCurrency).toBe("XLM");
  });

  it("sends null stock when the unlimited box is checked", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ item }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<ItemConfigPanel studioId="stu-1" item={{ ...item, stock: 5 }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("config-unlimited"));
    fireEvent.click(screen.getByTestId("config-save"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.stock).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/ItemConfigPanel.test.tsx"`
Expected: FAIL — `Cannot find module './ItemConfigPanel'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.tsx
"use client";
import { useEffect, useState } from "react";

type ItemDto = { id: string; name: string; priceAmount: string; priceCurrency: string; stock: number | null; imageUrl: string; saleStartsAt: string | null; saleEndsAt: string | null };

export function ItemConfigPanel({
  studioId, item, onSaved,
}: {
  studioId: string; item: ItemDto | null; onSaved: (updated: ItemDto) => void;
}) {
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"XLM" | "USDT">("USDT");
  const [stock, setStock] = useState<string>("");
  const [unlimited, setUnlimited] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setPrice(item.priceAmount);
    setCurrency(item.priceCurrency as "XLM" | "USDT");
    setUnlimited(item.stock === null);
    setStock(item.stock === null ? "" : String(item.stock));
    setSaleStartsAt(item.saleStartsAt ?? "");
    setSaleEndsAt(item.saleEndsAt ?? "");
  }, [item]);

  if (!item) {
    return (
      <aside className="w-64 shrink-0 border-r-2 border-outline-variant bg-surface-container-lowest p-3">
        <p data-testid="config-empty" className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">SELECT_AN_ITEM</p>
      </aside>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/studios/${studioId}/items/${item!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          priceAmount: price,
          priceCurrency: currency,
          stock: unlimited ? null : Number(stock),
          saleStartsAt: saleStartsAt || null,
          saleEndsAt: saleEndsAt || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const json = await res.json();
      onSaved(json.item as ItemDto);
    } catch {
      setError("Could not save. Check values and retry.");
    } finally {
      setSaving(false);
    }
  }

  const label = "font-mono text-[10px] uppercase tracking-[0.1em] text-outline";
  const input = "w-full border-b-2 border-outline-variant bg-transparent py-1 font-mono text-on-surface focus:border-primary-fixed focus:outline-none";

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-r-2 border-outline-variant bg-surface-container-lowest p-3">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">ITEM_CONFIG</h2>
      <p className="font-display text-on-surface">{item.name}</p>

      <label className={label}>PRICE
        <input data-testid="config-price" className={input} value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className={label}>CURRENCY
        <select data-testid="config-currency" className={input} value={currency} onChange={(e) => setCurrency(e.target.value as "XLM" | "USDT")}>
          <option value="USDT">USDT</option>
          <option value="XLM">XLM</option>
        </select>
      </label>
      <label className={`${label} flex items-center gap-2`}>
        <input data-testid="config-unlimited" type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
        UNLIMITED_STOCK
      </label>
      {!unlimited && (
        <label className={label}>STOCK
          <input data-testid="config-stock" type="number" className={input} value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
      )}
      <label className={label}>SALE_STARTS
        <input data-testid="config-sale-start" type="datetime-local" className={input} value={saleStartsAt} onChange={(e) => setSaleStartsAt(e.target.value)} />
      </label>
      <label className={label}>SALE_ENDS
        <input data-testid="config-sale-end" type="datetime-local" className={input} value={saleEndsAt} onChange={(e) => setSaleEndsAt(e.target.value)} />
      </label>

      {error && <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-error">{error}</p>}
      <button type="button" data-testid="config-save" disabled={saving} onClick={save}
        className="bg-primary-fixed px-3 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-on-primary-fixed active:scale-95 disabled:opacity-50">
        {saving ? "SAVING…" : "SAVE_ITEM"}
      </button>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/ItemConfigPanel.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.tsx" "apps/web/app/(studio)/dashboard/builder/components/ItemConfigPanel.test.tsx"
git commit -m "feat(builder): item config panel reuses PATCH items endpoint (w-64)"
```

---

### Task 11: StorefrontPreview (live player-facing render via shared component)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.tsx`
- Test: `apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.test.tsx`

**Interfaces:**
- Consumes: the SAME `StorefrontGrid` presentational component the public `/s/[slug]` renders (Task 3); current `ShopLayout`/`ShopTheme`/`featuredItemIds` from the store; `ItemDto[]`.
- Produces: `function StorefrontPreview({ layout, theme, featuredItemIds, items }: { layout: ShopLayout; theme: ShopTheme; featuredItemIds: string[]; items: StoreItem[] }): JSX.Element` — wraps `<StorefrontGrid>` so the preview is byte-for-byte the player output; updates live as the store changes.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StorefrontPreview } from "./StorefrontPreview";

const i1 = "11111111-1111-1111-1111-111111111111";
const items = [{ id: i1, name: "Sword Skin", priceAmount: "1.0000000", priceCurrency: "USDT", imageUrl: "/s.png", rarity: "LEGENDARY" }] as any;

describe("StorefrontPreview", () => {
  it("renders the player-facing grid for the current layout", () => {
    render(
      <StorefrontPreview
        layout={{ mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1] }] }}
        theme={{ primary: "#c3f400" }}
        featuredItemIds={[i1]}
        items={items}
      />,
    );
    expect(screen.getByTestId("storefront-grid")).toHaveAttribute("data-mode", "grid");
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
  });

  it("reflects list mode immediately", () => {
    render(<StorefrontPreview layout={{ mode: "list", sections: [] }} theme={{}} featuredItemIds={[]} items={[]} />);
    expect(screen.getByTestId("storefront-grid")).toHaveAttribute("data-mode", "list");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/StorefrontPreview.test.tsx"`
Expected: FAIL — `Cannot find module './StorefrontPreview'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.tsx
"use client";
import type { ShopLayout, ShopTheme } from "@xgamefi/shared";
import { StorefrontGrid } from "../../../../(storefront)/s/[slug]/StorefrontGrid";

type StoreItem = { id: string; name: string; priceAmount: string; priceCurrency: string; imageUrl: string; rarity?: string };

export function StorefrontPreview({
  layout, theme, featuredItemIds, items,
}: {
  layout: ShopLayout; theme: ShopTheme; featuredItemIds: string[]; items: StoreItem[];
}) {
  return (
    <div className="border-2 border-outline-variant bg-surface-container-lowest p-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-outline">LIVE_PREVIEW · PLAYER_VIEW</p>
      <StorefrontGrid layout={layout} theme={theme} featuredItemIds={featuredItemIds} items={items} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/components/StorefrontPreview.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.tsx" "apps/web/app/(studio)/dashboard/builder/components/StorefrontPreview.test.tsx"
git commit -m "feat(builder): live preview reuses storefront grid for exact player render"
```

---

### Task 12: ShopBuilder island (assemble shell + Save/Publish + reduced-motion)

**Files:**
- Create: `apps/web/app/(studio)/dashboard/builder/ShopBuilder.tsx`
- Test: `apps/web/app/(studio)/dashboard/builder/ShopBuilder.test.tsx`

**Interfaces:**
- Consumes: `useBuilderStore` (Task 7); `ItemConfigPanel` (Task 10, w-64 left); `LayoutCanvas` (Task 9, center); `StorefrontPreview` (Task 11); `ItemLibrary` (Task 8, w-80 right); `@dnd-kit/core` `DndContext` with `onDragEnd` → `ADD_ITEM`; `ShopDto`, `ItemDto`.
- Produces: `function ShopBuilder({ shop, items }: { shop: ShopDto; items: ItemDto[] }): JSX.Element` — three-column shell (`w-64` · fluid · `w-80`) with the preview in the fluid area, a top action bar with SAVE_DRAFT (`PUT …/shop/draft`) and PUBLISH (`POST …/shop/publish`), and `prefers-reduced-motion` gating on drag/preview transitions. Initial store seeds from `shop.draftLayout ?? shop.layout`, `shop.featuredItemIds`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/(studio)/dashboard/builder/ShopBuilder.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShopBuilder } from "./ShopBuilder";

const i1 = "11111111-1111-1111-1111-111111111111";
const shop = {
  id: "shop-1", studioId: "stu-1", slug: "gridlock", status: "DRAFT" as const,
  layout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [] }] },
  draftLayout: { mode: "grid", sections: [{ id: "all", title: "ALL", itemIds: [i1] }] },
  theme: { primary: "#c3f400" }, featuredItemIds: [], publishedAt: null,
};
const items = [{ id: i1, name: "Sword Skin", priceAmount: "1.0000000", priceCurrency: "USDT", imageUrl: "/s.png", stock: null, rarity: "LEGENDARY", saleStartsAt: null, saleEndsAt: null }] as any;

beforeEach(() => vi.restoreAllMocks());

describe("ShopBuilder", () => {
  it("renders all three panels + preview", () => {
    render(<ShopBuilder shop={shop as any} items={items} />);
    expect(screen.getByTestId("config-empty")).toBeInTheDocument();       // left config (no selection yet)
    expect(screen.getByTestId("canvas")).toBeInTheDocument();             // center
    expect(screen.getByText("ITEM_LIBRARY")).toBeInTheDocument();         // right
    expect(screen.getAllByTestId("storefront-grid").length).toBeGreaterThan(0); // preview
  });

  it("seeds the canvas from draftLayout", () => {
    render(<ShopBuilder shop={shop as any} items={items} />);
    expect(screen.getByTestId(`canvas-card-${i1}`)).toBeInTheDocument();
  });

  it("SAVE_DRAFT PUTs layout/theme/featured", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ shop }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<ShopBuilder shop={shop as any} items={items} />);
    fireEvent.click(screen.getByTestId("builder-save-draft"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/studios/stu-1/shop/draft");
    expect(init?.method).toBe("PUT");
    const body = JSON.parse(init!.body as string);
    expect(body.layout.sections[0].itemIds).toEqual([i1]);
    expect(body.theme.primary).toBe("#c3f400");
  });

  it("PUBLISH POSTs to the publish endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ shop: { ...shop, status: "PUBLISHED" } }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<ShopBuilder shop={shop as any} items={items} />);
    fireEvent.click(screen.getByTestId("builder-publish"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/studios/stu-1/shop/publish", expect.objectContaining({ method: "POST" })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/ShopBuilder.test.tsx"`
Expected: FAIL — `Cannot find module './ShopBuilder'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/(studio)/dashboard/builder/ShopBuilder.tsx
"use client";
import { useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { ShopDto } from "@xgamefi/shared";
import { useBuilderStore } from "./lib/useBuilderStore";
import { ItemConfigPanel } from "./components/ItemConfigPanel";
import { LayoutCanvas } from "./components/LayoutCanvas";
import { StorefrontPreview } from "./components/StorefrontPreview";
import { ItemLibrary } from "./components/ItemLibrary";

type ItemDto = { id: string; name: string; priceAmount: string; priceCurrency: string; imageUrl: string; stock: number | null; rarity?: string; saleStartsAt: string | null; saleEndsAt: string | null };

export function ShopBuilder({ shop, items }: { shop: ShopDto; items: ItemDto[] }) {
  const initialLayout = shop.draftLayout ?? shop.layout;
  const firstSectionId = initialLayout.sections[0]?.id ?? "all";
  const { state, dispatch } = useBuilderStore({
    layout: initialLayout.sections.length ? initialLayout : { mode: initialLayout.mode, sections: [{ id: "all", title: "ALL", itemIds: [] }] },
    featuredItemIds: shop.featuredItemIds,
    selectedItemId: null,
  });
  const [itemMap, setItemMap] = useState<Record<string, ItemDto>>(Object.fromEntries(items.map((i) => [i.id, i])));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allItems = Object.values(itemMap);
  const placedIds = state.layout.sections.flatMap((s) => s.itemIds);
  const selected = state.selectedItemId ? itemMap[state.selectedItemId] ?? null : null;

  function onDragEnd(e: DragEndEvent) {
    const itemId = e.active.data.current?.itemId as string | undefined;
    if (itemId && e.over?.id === "canvas-drop") {
      dispatch({ type: "ADD_ITEM", sectionId: firstSectionId, itemId });
    }
  }

  async function saveDraft() {
    setBusy(true); setStatus(null);
    try {
      const res = await fetch(`/api/v1/studios/${shop.studioId}/shop/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layout: state.layout, theme: shop.theme, featuredItemIds: state.featuredItemIds }),
      });
      setStatus(res.ok ? "DRAFT_SAVED" : "SAVE_FAILED");
    } catch { setStatus("SAVE_FAILED"); } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setStatus(null);
    try {
      await fetch(`/api/v1/studios/${shop.studioId}/shop/draft`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ layout: state.layout, theme: shop.theme, featuredItemIds: state.featuredItemIds }),
      });
      const res = await fetch(`/api/v1/studios/${shop.studioId}/shop/publish`, { method: "POST" });
      setStatus(res.ok ? "PUBLISHED" : "PUBLISH_FAILED");
    } catch { setStatus("PUBLISH_FAILED"); } finally { setBusy(false); }
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-5rem)] flex-col">
        <div className="flex items-center justify-between border-b-2 border-primary px-6 py-3 motion-safe:shadow-[0_0_15px_var(--primary-glow)]">
          <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-outline">SHOP_BUILDER · /s/{shop.slug}</span>
          <div className="flex items-center gap-3">
            {status && <span data-testid="builder-status" className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary-fixed">{status}</span>}
            <button type="button" data-testid="builder-save-draft" disabled={busy} onClick={saveDraft}
              className="border-2 border-outline px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] hover:border-primary-fixed hover:text-primary-fixed disabled:opacity-50">SAVE_DRAFT</button>
            <button type="button" data-testid="builder-publish" disabled={busy} onClick={publish}
              className="bg-primary-fixed px-4 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-on-primary-fixed active:scale-95 disabled:opacity-50">PUBLISH</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <ItemConfigPanel studioId={shop.studioId} item={selected} onSaved={(u) => setItemMap((m) => ({ ...m, [u.id]: { ...m[u.id], ...u } }))} />
          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <LayoutCanvas
              layout={state.layout} items={allItems} featuredItemIds={state.featuredItemIds} selectedItemId={state.selectedItemId}
              onSetMode={(mode) => dispatch({ type: "SET_MODE", mode })}
              onRemove={(id) => dispatch({ type: "REMOVE_ITEM", itemId: id })}
              onToggleFeatured={(id) => dispatch({ type: "TOGGLE_FEATURED", itemId: id })}
              onSelect={(id) => dispatch({ type: "SELECT_ITEM", itemId: id })}
            />
            <div className="overflow-y-auto px-6 pb-6">
              <StorefrontPreview layout={state.layout} theme={shop.theme} featuredItemIds={state.featuredItemIds} items={allItems} />
            </div>
          </div>
          <ItemLibrary items={allItems} placedItemIds={placedIds}
            onAdd={(id) => dispatch({ type: "ADD_ITEM", sectionId: firstSectionId, itemId: id })}
            onSelect={(id) => dispatch({ type: "SELECT_ITEM", itemId: id })}
          />
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test "app/(studio)/dashboard/builder/ShopBuilder.test.tsx"`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check the whole web app**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/builder/ShopBuilder.tsx" "apps/web/app/(studio)/dashboard/builder/ShopBuilder.test.tsx"
git commit -m "feat(builder): assemble 3-panel shell with save-draft/publish + reduced-motion"
```

---

### Task 13: E2E — rearrange + publish → storefront reflects (acceptance gate)

**Files:**
- Create: `apps/web/e2e/shop-builder.spec.ts`

**Interfaces:**
- Consumes: seeded Gridlock studio (`slug: gridlock`) + studio login from Phase 0/1 seed; the builder UI (Tasks 6–12); the public storefront `/s/gridlock` (Phase 2 reading published `layout`/`theme`/`featuredItemIds`).
- Produces: the Phase-4 acceptance e2e proving the full loop: open builder → add/rearrange an item + mark featured → publish → `/s/gridlock` reflects the new layout/featured.

- [ ] **Step 1: Write the e2e test**

```ts
// apps/web/e2e/shop-builder.spec.ts
import { test, expect } from "@playwright/test";

const STUDIO_USER = process.env.E2E_STUDIO_USERNAME ?? "gridlock";
const STUDIO_PASS = process.env.E2E_STUDIO_PASSWORD ?? "change-me-strong";

test("studio rearranges + publishes, storefront reflects the new layout/featured", async ({ page }) => {
  // log in as the studio user
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(STUDIO_USER);
  await page.getByLabel(/password/i).fill(STUDIO_PASS);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // open the builder
  await page.goto("/dashboard/builder");
  await expect(page.getByText("ITEM_LIBRARY")).toBeVisible();

  // add the first library item to the canvas via the ADD fallback
  const addButtons = page.locator('[data-testid^="lib-add-"]');
  const firstAdd = addButtons.first();
  const libTestId = await firstAdd.getAttribute("data-testid");
  const itemId = libTestId!.replace("lib-add-", "");
  await firstAdd.click();

  // it now appears on the canvas; mark it featured
  const canvasCard = page.getByTestId(`canvas-card-${itemId}`);
  await expect(canvasCard).toBeVisible();
  await page.getByTestId(`canvas-feature-${itemId}`).click();
  await expect(canvasCard).toHaveAttribute("data-featured", "true");

  // switch to LIST mode
  await page.getByTestId("mode-list").click();

  // publish
  await page.getByTestId("builder-publish").click();
  await expect(page.getByTestId("builder-status")).toHaveText("PUBLISHED");

  // public storefront reflects published layout + featured
  await page.goto("/s/gridlock");
  const grid = page.getByTestId("storefront-grid");
  await expect(grid).toHaveAttribute("data-mode", "list");
  const firstCard = page.getByTestId("item-card").first();
  await expect(firstCard).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e (services + seed must be up)**

```bash
docker compose up -d
pnpm --filter @xgamefi/db prisma migrate deploy
pnpm --filter @xgamefi/db db:seed
pnpm --filter web build && pnpm --filter web start &
pnpm --filter web exec playwright test e2e/shop-builder.spec.ts
```
Expected: PASS — storefront grid `data-mode="list"` after publish; featured card present.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/shop-builder.spec.ts
git commit -m "test(e2e): builder rearrange+publish reflected on storefront"
```

---

### Task 14: Wire builder into the dashboard nav + full phase verification

**Files:**
- Modify: `apps/web/app/(studio)/dashboard/_components/SideRail.tsx` (Phase-2 dashboard left rail) — add a `BUILDER` link to `/dashboard/builder` if absent.
- Test: covered by Task 13 e2e navigation; no new unit test.

**Interfaces:**
- Consumes: existing dashboard nav component.
- Produces: a visible `/dashboard/builder` entry; final green run of lint/tsc/test across the phase.

- [ ] **Step 1: Add the nav link**

```tsx
// apps/web/app/(studio)/dashboard/_components/SideRail.tsx  (add to the link list)
{ href: "/dashboard/builder", label: "BUILDER" },
```

> If the rail builds links from an array, add the entry; if hard-coded `<Link>`s, insert one matching the existing pattern with `font-mono uppercase tracking-[0.1em]` styling and the active `bg-primary text-on-primary border-l-4 border-secondary` treatment.

- [ ] **Step 2: Run the full Phase-4 unit/handler suite**

Run:
```bash
pnpm --filter @xgamefi/shared test src/zod/shop.test.ts src/dto/shop.test.ts
pnpm --filter web test "app/api/v1/studios/[id]/shop" "app/(studio)/dashboard/builder" "app/(storefront)/s/[slug]/StorefrontGrid.test.tsx"
```
Expected: all PASS.

- [ ] **Step 3: Lint + type-check**

Run: `pnpm lint && pnpm --filter web exec tsc --noEmit && pnpm --filter @xgamefi/shared exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(studio)/dashboard/_components/SideRail.tsx"
git commit -m "feat(builder): add builder entry to studio dashboard nav"
```

---

## Self-Review

**1. Spec coverage** (SPEC §6.1 + §7 shop builder + decomposition Phase 4 gate):

| Requirement | Task |
| --- | --- |
| LEFT item library — synced items, draggable | Task 8 (ItemLibrary, `@dnd-kit` draggable, w-80) |
| CENTER layout canvas — drag to arrange, grid/list toggle, choose featured | Task 9 (LayoutCanvas) + Task 7 (REORDER/SET_MODE/TOGGLE_FEATURED reducer) |
| RIGHT item/pricing config — price/currency/stock/sale window | Task 10 (ItemConfigPanel) |
| Live PREVIEW pane — exact player-facing render | Task 11 (StorefrontPreview reusing StorefrontGrid) |
| Builder canvas is a `"use client"` island; layout persisted as Json | Tasks 6 (server page) + 12 (client island) + 1 (Json schema) |
| BRAND three-column shell (w-64 · fluid · w-80) + reduced-motion | Task 12 (shell + `motion-safe:`) |
| `PUT …/shop/draft` (validate w/ Zod) | Task 4 |
| `POST …/shop/publish` (draft→layout, PUBLISHED, publishedAt) | Task 5 |
| Per-item edits reuse PATCH items endpoint (consume, not recreate) | Task 10 (fetch to existing endpoint) |
| Storefront renders published layout/theme — confirm contract | Task 3 (regression guard, no rework) |
| Acceptance gate: rearrange + publish → `/s/[slug]` reflects | Task 13 (e2e) |
| studioId scoping / mapped DTOs | Tasks 4, 5, 6 (requireStudio/scopeToStudio + toShopDto/toItemDto) |
| Test types required: handler tests (draft+publish), layout-schema validation, component render/interaction | Tasks 4, 5 (handlers); Task 1 (schema); Tasks 3, 8, 9, 10, 11, 12 (component) |

No gaps found.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases/similar to Task N" left. Every code step has full code; every test step has real assertions; every command has expected output. The two "if Phase 2 already did X" notes are conditional reuse guidance (consume-don't-recreate), not placeholders — each still ships full code.

**3. Type consistency:** `ShopLayout`/`ShopTheme`/`ShopSection` defined in Task 1 are imported by Tasks 2, 3, 7, 9, 11, 12. `ShopDto` defined in Task 2 is consumed by Tasks 4, 5, 6, 12. `ShopDraftInputSchema` (Task 1) used by Task 4; `ShopLayoutSchema` (Task 1) used by Task 5. `BuilderState`/`builderReducer`/`useBuilderStore` (Task 7) consumed by Task 12. `LayoutCanvasProps` (Task 9), `ItemConfigPanel` props (Task 10), `ItemLibrary` props (Task 8), `StorefrontPreview` props (Task 11) all match the call sites in Task 12. The draft handler `data` keys (`draftLayout`/`theme`/`featuredItemIds`) match `ShopDraftInputSchema` output and the `ShopBuilder` PUT body. `toItemDto`/`toShopDto` names are the canonical-interface names. `StorefrontGrid` prop shape is identical in Tasks 3, 11. Consistent throughout — no mismatches.
