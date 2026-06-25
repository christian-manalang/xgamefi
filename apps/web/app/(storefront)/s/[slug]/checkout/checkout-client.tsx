"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { isConnected, signTransaction } from "@stellar/freighter-api";
import type { ItemDto, ShopDto } from "@xgamefi/shared/dto";

type Quote = {
  order: { id: string };
  quote: {
    destination: string;
    asset: { code: string; issuer?: string };
    amount: string;
    memo: string;
    unsignedXdr: string;
  };
};

type CheckoutClientProps = {
  shop: ShopDto;
  item: ItemDto;
  referralCode: string | null;
  currency: string | null;
};

export function CheckoutClient({ shop, item, referralCode, currency }: CheckoutClientProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<string>("waiting for quote");
  const [qr, setQr] = useState<string | null>(null);
  const [freighterAvailable, setFreighterAvailable] = useState(false);

  useEffect(() => {
    isConnected().then((r) => setFreighterAvailable(r.isConnected)).catch(() => setFreighterAvailable(false));
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    fetch("/api/v1/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, currency: currency ?? item.price.currency, referralCode }),
    })
      .then((r) => r.json())
      .then((data: Quote) => {
        setQuote(data);
        setStatus("pending payment");
        const assetPart = data.quote.asset.issuer
          ? `&asset_code=${encodeURIComponent(data.quote.asset.code)}&asset_issuer=${encodeURIComponent(data.quote.asset.issuer)}`
          : "";
        const uri = `web+stellar:pay?destination=${encodeURIComponent(data.quote.destination)}&amount=${encodeURIComponent(data.quote.amount)}&memo=${encodeURIComponent(data.quote.memo)}${assetPart}`;
        QRCode.toDataURL(uri).then(setQr);

        es = new EventSource(`/api/v1/orders/${data.order.id}/events`);
        es.onmessage = (ev) => {
          const payload = JSON.parse(ev.data) as { paymentStatus?: string; deliveryStatus?: string };
          setStatus(`${payload.paymentStatus ?? "PENDING"} / ${payload.deliveryStatus ?? "PENDING"}`);
          if (payload.deliveryStatus === "DELIVERED") es?.close();
        };
      })
      .catch((err) => {
        console.error("checkout quote failed", err);
        setStatus("quote failed");
      });

    return () => {
      if (es) es.close();
    };
  }, [item.id, item.price.currency, referralCode, currency]);

  async function payWithFreighter() {
    if (!quote) return;
    try {
      const signed = await signTransaction(quote.quote.unsignedXdr, { networkPassphrase: "Test SDF Network ; September 2015" });
      alert("Signed XDR: " + signed);
    } catch (err) {
      console.error("freighter sign failed", err);
      setStatus("freighter sign failed");
    }
  }

  return (
    <div className="container-max mx-auto px-4 py-12">
      <h1 className="font-display text-[48px] font-semibold text-on-surface mb-8">Checkout</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-surface-container-low border-2 border-outline-variant p-6">
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-2">ITEM</p>
          <h2 className="font-display text-[24px] text-on-surface">{item.name}</h2>
          <p className="font-display text-[32px] text-primary-fixed mt-4">
            {item.price.amount} {item.price.currency}
          </p>
          <p className="mt-4 text-on-surface-variant">{shop.slug} store</p>
        </div>
        <div className="bg-surface-container-low border-2 border-outline-variant p-6 flex flex-col items-center">
          {qr ? (
            <img src={qr} alt="Payment QR" className="w-64 h-64" />
          ) : (
            <span className="text-on-surface-variant">Generating QR…</span>
          )}
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mt-4">Scan with Freighter</p>
          {freighterAvailable && (
            <button
              onClick={payWithFreighter}
              className="mt-4 bg-primary-fixed text-on-primary-fixed px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px]"
            >
              Pay with Freighter
            </button>
          )}
          <p className="mt-4 text-on-surface" data-order-id={quote?.order.id}>
            Status: {status}
          </p>
        </div>
      </div>
    </div>
  );
}
