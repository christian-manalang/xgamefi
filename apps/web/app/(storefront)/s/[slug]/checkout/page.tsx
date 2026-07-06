import { notFound } from "next/navigation";
import { getPublishedShop, getPublicItem, getStudioBrand } from "../../../../../lib/catalogue-queries";
import { brandToStyle } from "../brand";
import { CheckoutClient } from "./checkout-client";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ item?: string; ref?: string; currency?: string }>;
}) {
  const { slug } = await params;
  const { item: itemId, ref, currency } = await searchParams;
  const [shop, item, brand] = await Promise.all([
    getPublishedShop(slug),
    itemId ? getPublicItem(itemId) : Promise.resolve(null),
    getStudioBrand(slug),
  ]);
  if (!shop || !item) notFound();

  return (
    <main style={brandToStyle(brand)} className="min-h-screen bg-background text-on-background">
      <CheckoutClient shop={shop} item={item} referralCode={ref ?? null} currency={currency ?? null} />
    </main>
  );
}
