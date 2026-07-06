import Link from "next/link";
import { env } from "@xgamefi/config/env";
import { notFound } from "next/navigation";
import { getPublishedShop, getStudioBrand } from "@/lib/catalogue-queries";
import { brandToStyle } from "../brand";
import { ReferralPanel } from "./ReferralPanel";

export default async function ReferralsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [shop, brand] = await Promise.all([getPublishedShop(slug), getStudioBrand(slug)]);
  if (!shop) notFound();

  return (
    <main style={brandToStyle(brand)} className="min-h-screen bg-background text-on-background">
      <section className="max-w-[1440px] mx-auto px-5 md:px-16 py-10">
        <div className="mb-6">
          <Link
            href={`/s/${slug}`}
            className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed transition-colors"
          >
            ← Back to Shop
          </Link>
        </div>
        <h1 className="font-display text-[48px] mb-6 italic">Refer & Earn</h1>
        <ReferralPanel slug={slug} appBaseUrl={env.APP_BASE_URL} />
      </section>
    </main>
  );
}
