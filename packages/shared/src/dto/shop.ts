import type { ShopLayout, ShopTheme } from "../zod/shop";

export type ShopWithSlug = {
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

function coerceLayout(value: unknown): ShopLayout {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const mode = v.mode === "list" ? "list" : "grid";
    const sections = Array.isArray(v.sections) ? (v.sections as ShopLayout["sections"]) : [];
    return { mode, sections };
  }
  return { mode: "grid", sections: [] };
}

function coerceTheme(value: unknown): ShopTheme {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ShopTheme;
  }
  return {};
}

export function toShopDto(row: ShopWithSlug): ShopDto {
  return {
    id: row.id,
    studioId: row.studioId,
    slug: row.studio.slug,
    status: row.status,
    layout: coerceLayout(row.layout),
    draftLayout: row.draftLayout ? coerceLayout(row.draftLayout) : null,
    theme: coerceTheme(row.theme),
    featuredItemIds: row.featuredItemIds,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}
