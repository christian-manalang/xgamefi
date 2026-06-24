"use client";
import { useEffect, useState } from "react";

interface Performance {
  code: string;
  total: number;
  qualified: number;
  rewarded: number;
  totalRewardAmount: string;
  rewardCurrency: string | null;
}

export function ReferralPanel({ slug, appBaseUrl }: { slug: string; appBaseUrl: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);

  useEffect(() => {
    (async () => {
      const gen = await fetch("/api/v1/referrals", { method: "POST" });
      const generated = await gen.json();
      setCode(generated.code);
      const me = await fetch("/api/v1/referrals/me");
      setPerf(await me.json());
    })();
  }, []);

  const shareLink = code ? `${appBaseUrl}/s/${slug}?ref=${code}` : "";

  return (
    <section className="bg-surface-container-low border-2 border-outline-variant p-6 space-y-6">
      <h2 className="font-mono uppercase tracking-[0.1em] text-on-surface-variant text-xs">REFERRAL_PROGRAM</h2>
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-outline">YOUR CODE</p>
        <p className="text-2xl text-primary-fixed font-display">{code ?? "…"}</p>
        <p className="break-all text-on-surface-variant text-sm">{shareLink}</p>
      </div>
      {perf && (
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="font-mono text-xs uppercase text-outline">INVITED</dt>
            <dd className="text-primary-fixed text-xl">{perf.total}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs uppercase text-outline">QUALIFIED</dt>
            <dd className="text-primary-fixed text-xl">{perf.qualified}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs uppercase text-outline">REWARDED</dt>
            <dd className="text-primary-fixed text-xl">{perf.rewarded}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
