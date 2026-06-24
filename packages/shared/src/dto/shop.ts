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
