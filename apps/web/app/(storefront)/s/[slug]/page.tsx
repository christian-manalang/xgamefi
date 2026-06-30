import { notFound } from "next/navigation";
import Link from "next/link";
import type { ShopItemsQuery } from "@xgamefi/shared/zod/catalogue";
import { ShopItemsQuery as ShopItemsQuerySchema } from "@xgamefi/shared/zod/catalogue";
import {
  getPublishedShop,
  getShopFilterOptions,
  getShopItems,
  getStudioBrand,
} from "../../../../lib/catalogue-queries";
import { brandToStyle } from "./brand";
import { StorefrontFilters } from "./_components/storefront-filters";
import { StorefrontGrid } from "./StorefrontGrid";

function toFlatSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
  }
  return sp;
}

function buildQuery(sp: URLSearchParams): ShopItemsQuery {
  const parsed = ShopItemsQuerySchema.safeParse(Object.fromEntries(sp));
  if (parsed.success) return parsed.data;
  return { page: 1, pageSize: 24 };
}

function pageHref(page: number, sp: URLSearchParams): string {
  const next = new URLSearchParams(sp);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = toFlatSearchParams(await searchParams);
  const query = buildQuery(sp);

  const [shop, { items, total, page, pageSize }, { categories, rarities }, brand] = await Promise.all([
    getPublishedShop(slug),
    getShopItems(slug, query),
    getShopFilterOptions(slug),
    getStudioBrand(slug),
  ]);

  if (!shop) notFound();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main style={brandToStyle(brand)} className="min-h-screen bg-background text-on-background">
      <section className="flex flex-col gap-6 p-8 max-w-[1440px] mx-auto">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">
              {typeof brand?.name === "string" ? brand.name : slug}
            </h1>
            <nav className="flex items-center gap-3">
              <Link
                href={`/s/${slug}/referrals`}
                className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-colors"
              >
                Referrals
              </Link>
              <Link
                href={`/s/${slug}/market`}
                className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-colors"
              >
                Market
              </Link>
            </nav>
          </div>
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
            {total} ITEM{total === 1 ? "" : "S"} · PAGE {page} OF {totalPages}
          </p>
        </header>

        <StorefrontFilters categories={categories} rarities={rarities} />

        <StorefrontGrid
          layout={shop.layout}
          theme={shop.theme}
          featuredItemIds={shop.featuredItemIds}
          items={items}
          slug={slug}
        />

        {(hasPrev || hasNext) && (
          <nav className="flex items-center justify-between gap-4 pt-4 border-t-2 border-outline-variant">
            <Link
              href={pageHref(page - 1, sp)}
              aria-disabled={!hasPrev}
              className={`font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant ${
                hasPrev ? "hover:border-primary-fixed" : "opacity-40 pointer-events-none"
              }`}
            >
              Previous
            </Link>
            <Link
              href={pageHref(page + 1, sp)}
              aria-disabled={!hasNext}
              className={`font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant ${
                hasNext ? "hover:border-primary-fixed" : "opacity-40 pointer-events-none"
              }`}
            >
              Next
            </Link>
          </nav>
        )}
      </section>
    </main>
  );
}
