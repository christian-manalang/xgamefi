import { notFound } from "next/navigation";
import { getPublishedShop } from "@/lib/catalogue-queries";
import { ListingCard } from "./_components/listing-card";

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublishedShop(slug);
  if (!shop) notFound();

  const page = Number((await searchParams).page ?? "1");
  const res = await fetch(`${process.env.APP_BASE_URL}/api/v1/p2p/listings/query?slug=${slug}&page=${page}`, { next: { revalidate: 30 } });
  const data = await res.json();
  const listings: { id: string; itemId: string; price: { amount: string; currency: string } }[] = data.listings ?? [];

  return (
    <main className="min-h-screen bg-background text-on-background max-w-[1440px] mx-auto px-5 md:px-16 py-10">
      <h1 className="font-display text-[48px] font-semibold text-on-surface mb-8">Market</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} slug={slug} />
        ))}
      </div>
    </main>
  );
}
