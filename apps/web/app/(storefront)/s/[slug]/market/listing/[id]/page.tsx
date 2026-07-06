import { notFound } from "next/navigation";
import { getPublishedShop, getStudioBrand } from "@/lib/catalogue-queries";
import { brandToStyle } from "../../../brand";
import { BuyClient } from "../../_components/buy-client";

export default async function ListingDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const [shop, brand] = await Promise.all([getPublishedShop(slug), getStudioBrand(slug)]);
  if (!shop) notFound();

  const res = await fetch(`${process.env.APP_BASE_URL}/api/v1/p2p/listings/${id}`, { next: { revalidate: 30 } });
  const data = await res.json();
  if (!data.listing) notFound();

  return (
    <main style={brandToStyle(brand)} className="min-h-screen bg-background text-on-background">
      <BuyClient listing={data.listing} />
    </main>
  );
}
