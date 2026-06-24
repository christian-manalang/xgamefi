"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { signTransaction } from "@stellar/freighter-api";

type BuyClientProps = {
  listing: { id: string; itemId: string; price: { amount: string; currency: string } };
};

type Quote = {
  trade: { id: string };
  quote: { destination: string; asset: { code: string; issuer?: string }; amount: string; memo: string; unsignedXdr: string };
};

export function BuyClient({ listing }: BuyClientProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("click Buy to start");

  async function startQuote() {
    setStatus("quoting…");
    const res = await fetch("/api/v1/p2p/trades/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id }),
    });
    const data: Quote = await res.json();
    setQuote(data);
    setStatus("pending escrow payment");
    const assetPart = data.quote.asset.issuer ? `&asset_code=${data.quote.asset.code}&asset_issuer=${data.quote.asset.issuer}` : "";
    const uri = `web+stellar:pay?destination=${data.quote.destination}&amount=${data.quote.amount}&memo=${data.quote.memo}${assetPart}`;
    QRCode.toDataURL(uri).then(setQr);
  }

  async function payWithFreighter() {
    if (!quote) return;
    try {
      const signed = await signTransaction(quote.quote.unsignedXdr, { networkPassphrase: "Test SDF Network ; September 2015" });
      setStatus("signed — submit from your wallet: " + signed);
    } catch (err) {
      console.error("freighter sign failed", err);
      setStatus("freighter sign failed");
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-5 md:px-16 py-12">
      <h1 className="font-display text-[48px] text-on-surface mb-8">Buy Item</h1>
      <div className="bg-surface-container-low border-2 border-outline-variant p-6 max-w-md">
        <p className="font-display text-[32px] text-primary-fixed">
          {listing.price.amount} {listing.price.currency}
        </p>
        <button onClick={startQuote} className="mt-4 bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px]">
          Buy
        </button>
        {quote && (
          <button onClick={payWithFreighter} className="mt-4 ml-3 border-2 border-outline px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface">
            Pay with Freighter
          </button>
        )}
        {qr && <img src={qr} alt="Payment QR" className="w-64 h-64 mt-6" />}
        <p className="mt-4 text-on-surface">Status: {status}</p>
      </div>
    </div>
  );
}
