"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getAddress, isConnected, signTransaction } from "@stellar/freighter-api";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

type BuyClientProps = {
  listing: { id: string; itemId: string; price: { amount: string; currency: string } };
};

type Quote = {
  trade: { id: string };
  quote: { destination: string; asset: { code: string; issuer?: string }; amount: string; memo: string; unsignedXdr: string };
};

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;

function truncateTextMemo(memo: string): string {
  const buf = Buffer.from(memo, "utf8");
  if (buf.length <= 28) return memo;
  let end = 28;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

function toStellarAsset(asset: { code: string; issuer?: string }): Asset {
  return asset.code === "XLM" && !asset.issuer
    ? Asset.native()
    : new Asset(asset.code, asset.issuer!);
}

function horizonErrorMessage(err: unknown): string {
  const anyErr = err as { response?: { data?: { title?: string; extras?: { result_codes?: unknown } } }; data?: { title?: string; extras?: { result_codes?: unknown } } } | undefined;
  const data = anyErr?.response?.data ?? anyErr?.data;
  if (data) {
    const codes = data.extras?.result_codes;
    return `${data.title ?? "Horizon error"}${codes ? ` (${JSON.stringify(codes)})` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function BuyClient({ listing }: BuyClientProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("click Buy to start");
  const [freighterAvailable, setFreighterAvailable] = useState(false);

  useEffect(() => {
    isConnected().then((r) => setFreighterAvailable(r.isConnected)).catch(() => setFreighterAvailable(false));
  }, []);

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
    setStatus("signing with Freighter…");
    try {
      const addressRes = await getAddress();
      if (addressRes.error) throw new Error(addressRes.error);
      const sourceAddress = addressRes.address;
      if (!sourceAddress) throw new Error("No wallet address");

      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(sourceAddress);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.payment({
            destination: quote.quote.destination,
            asset: toStellarAsset(quote.quote.asset),
            amount: quote.quote.amount,
          }),
        )
        .addMemo(Memo.text(truncateTextMemo(quote.quote.memo)))
        .setTimeout(180)
        .build();

      const signed = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
      if (signed.error) throw new Error(signed.error);

      const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
      const submitted = await server.submitTransaction(signedTx);
      setStatus(`escrow submitted: ${submitted.hash.slice(0, 12)}…`);
    } catch (err) {
      console.error("freighter escrow failed", err);
      setStatus("escrow failed: " + horizonErrorMessage(err));
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
        {quote && freighterAvailable && (
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
