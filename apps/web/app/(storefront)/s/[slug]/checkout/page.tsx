import { notFound } from "next/navigation";
import { getPublishedShop, getPublicItem } from "../../../../../lib/catalogue-queries";
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
  const [shop, item] = await Promise.all([
    getPublishedShop(slug),
    itemId ? getPublicItem(itemId) : Promise.resolve(null),
  ]);
  if (!shop || !item) notFound();

  return (
    <main className="min-h-screen bg-background text-on-background">
      <CheckoutClient shop={shop} item={item} referralCode={ref ?? null} currency={currency ?? null} />
    </main>
  );
}
