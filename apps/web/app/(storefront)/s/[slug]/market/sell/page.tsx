import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedShop, getStudioBrand } from "@/lib/catalogue-queries";
import { getPrincipal } from "@/lib/auth/guards";
import { getMySellableItems } from "@/lib/p2p-queries";
import { brandToStyle } from "../../brand";
import { SellClient } from "./_components/sell-client";

export default async function SellPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [shop, brand, principal] = await Promise.all([
    getPublishedShop(slug),
    getStudioBrand(slug),
    getPrincipal(),
  ]);
  if (!shop) notFound();

  const isPlayer = principal?.kind === "player";
  const items = isPlayer ? await getMySellableItems(slug, principal.playerId) : [];

  return (
    <main style={brandToStyle(brand)} className="min-h-screen bg-background text-on-background">
      <section className="max-w-[1440px] mx-auto px-5 md:px-16 py-10">
        <div className="mb-6">
          <Link
            href={`/s/${slug}/market`}
            className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-colors"
          >
            ← Back to Market
          </Link>
        </div>
        <h1 className="font-display text-[48px] font-semibold text-on-surface mb-8">Sell Item</h1>
        <SellClient slug={slug} initialItems={items} isPlayer={isPlayer} />
      </section>
    </main>
  );
}
