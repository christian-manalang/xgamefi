import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicItem, getPublishedShop, getStudioBrand } from "../../../../../../lib/catalogue-queries";
import { brandToStyle } from "../../brand";

function formatAmount(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export default async function Page({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params;

  const [item, shop, brand] = await Promise.all([
    getPublicItem(itemId),
    getPublishedShop(slug),
    getStudioBrand(slug),
  ]);

  if (!item || !shop) notFound();

  const studioName = typeof brand?.name === "string" ? brand.name : slug;

  return (
    <main style={brandToStyle(brand)} className="min-h-screen bg-background text-on-background">
      <section className="flex flex-col gap-6 p-8 max-w-[1440px] mx-auto">
        <div className="flex items-center gap-4">
          <Link
            href={`/s/${slug}`}
            className="flex items-center gap-2 font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-colors"
          >
            ← Back to Shop
          </Link>
        </div>

        <nav className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
          <Link href={`/s/${slug}`} className="hover:text-primary-fixed transition-colors">
            {studioName}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-on-surface">{item.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full aspect-square object-cover bg-surface-container-low border-2 border-outline-variant"
            />
          ) : (
            <div className="w-full aspect-square bg-surface-container-low border-2 border-outline-variant flex items-center justify-center font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
              No Image
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
                {item.externalId}
              </span>
              <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">
                {item.name}
              </h1>
              {item.rarity ? (
                <span className="w-fit font-mono uppercase tracking-[0.1em] text-[12px] px-2 py-1 bg-primary-fixed text-on-primary-fixed"
                >
                  {item.rarity}
                </span>
              ) : null}
            </div>

            <p className="text-on-surface-variant">{item.description ?? "No description available."}</p>

            <div className="flex items-center justify-between p-4 bg-surface-container-low border-2 border-outline-variant"
            >
              <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant"
              >
                {item.stock === null ? "UNLIMITED STOCK" : `STOCK ${item.stock}`}
              </span>
              <span className="font-display text-[32px] font-semibold text-primary-fixed"
              >
                {formatAmount(item.price.amount)} <span className="text-[14px] font-mono">{item.price.currency}</span>
              </span>
            </div>

            <Link
              href={`/s/${slug}/checkout?item=${item.id}`}
              className="block w-full text-center bg-primary-fixed text-on-primary-fixed py-4 font-mono uppercase tracking-[0.1em] text-[12px] hover:opacity-90 transition-opacity"
            >
              Buy now
            </Link>

            {Object.keys(item.metadata).length > 0 && (
              <dl className="grid grid-cols-2 gap-2">
                {Object.entries(item.metadata).map(([key, value]) => (
                  <div key={key} className="bg-surface-container-high p-2">
                    <dt className="font-mono uppercase tracking-[0.1em] text-[10px] text-on-surface-variant">{key}</dt>
                    <dd className="font-mono text-[12px] text-on-surface">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
