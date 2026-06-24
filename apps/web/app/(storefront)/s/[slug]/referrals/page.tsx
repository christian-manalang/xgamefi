import { env } from "@xgamefi/config/env";
import { ReferralPanel } from "./ReferralPanel";

export default async function ReferralsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="max-w-[1440px] mx-auto px-5 md:px-16 py-10">
      <h1 className="font-display text-4xl mb-6 italic">Refer &amp; Earn</h1>
      <ReferralPanel slug={slug} appBaseUrl={env.APP_BASE_URL} />
    </main>
  );
}
