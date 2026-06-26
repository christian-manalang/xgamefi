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

function hasTrustline(account: Horizon.AccountResponse, asset: { code: string; issuer?: string }): boolean {
  if (asset.code === "XLM" && !asset.issuer) return true;
  return account.balances.some((b) => {
    if (b.asset_type === "native") return false;
    return "asset_code" in b && b.asset_code === asset.code && "asset_issuer" in b && b.asset_issuer === asset.issuer;
  });
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

export function CheckoutClient({ shop, item, referralCode, currency }: CheckoutClientProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("waiting for quote");
  const [orderStatus, setOrderStatus] = useState<{ paymentStatus: string; deliveryStatus: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [freighterAvailable, setFreighterAvailable] = useState(false);
  const [missingTrustline, setMissingTrustline] = useState(false);
  const [sourceAddress, setSourceAddress] = useState<string | null>(null);

  useEffect(() => {
    isConnected().then((r) => setFreighterAvailable(r.isConnected)).catch(() => setFreighterAvailable(false));
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    const body: Record<string, unknown> = {
      itemId: item.id,
      currency: currency ?? item.price.currency,
    };
    if (referralCode) body.referralCode = referralCode;

    fetch("/api/v1/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data: Quote) => {
        setQuote(data);
        setStatusMessage("pending payment");
        setOrderStatus({ paymentStatus: "PENDING", deliveryStatus: "PENDING" });
        setMissingTrustline(false);
        const assetPart = data.quote.asset.issuer
          ? `&asset_code=${encodeURIComponent(data.quote.asset.code)}&asset_issuer=${encodeURIComponent(data.quote.asset.issuer)}`
          : "";
        const uri = `web+stellar:pay?destination=${encodeURIComponent(data.quote.destination)}&amount=${encodeURIComponent(data.quote.amount)}&memo=${encodeURIComponent(data.quote.memo)}${assetPart}`;
        QRCode.toDataURL(uri).then(setQr);

        es = new EventSource(`/api/v1/orders/${data.order.id}/events`, { withCredentials: true });
        es.onmessage = (ev) => {
          const payload = JSON.parse(ev.data) as { paymentStatus?: string; deliveryStatus?: string };
          setOrderStatus((prev) => {
            const next = { paymentStatus: prev?.paymentStatus ?? "PENDING", deliveryStatus: prev?.deliveryStatus ?? "PENDING", ...payload };
            return next;
          });
          if (payload.deliveryStatus === "DELIVERED") es?.close();
        };
      })
      .catch((err) => {
        console.error("checkout quote failed", err);
        setStatusMessage("quote failed");
      });

    return () => {
      if (es) es.close();
    };
  }, [item.id, item.price.currency, referralCode, currency]);

  async function addTrustline() {
    if (!quote || !sourceAddress) return;
    setStatusMessage(`adding ${quote.quote.asset.code} trustline…`);
    try {
      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(sourceAddress);
      const asset = toStellarAsset(quote.quote.asset);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.changeTrust({ asset }))
        .setTimeout(180)
        .build();

      const signed = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
      if (signed.error) throw new Error(signed.error);

      const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
      await server.submitTransaction(signedTx);
      setMissingTrustline(false);
      setStatusMessage(`${quote.quote.asset.code} trustline added — you can now pay`);
    } catch (err) {
      console.error("add trustline failed", err);
      setStatusMessage("trustline failed: " + horizonErrorMessage(err));
    }
  }

  async function payWithFreighter() {
    if (!quote) return;
    setStatusMessage("signing with Freighter…");
    try {
      const addressRes = await getAddress();
      if (addressRes.error) throw new Error(addressRes.error);
      const addr = addressRes.address;
      if (!addr) throw new Error("No wallet address");
      setSourceAddress(addr);

      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(addr);

      const asset = toStellarAsset(quote.quote.asset);
      if (!hasTrustline(account, quote.quote.asset)) {
        setMissingTrustline(true);
        setStatusMessage(`${quote.quote.asset.code} trustline required before payment`);
        return;
      }
      setMissingTrustline(false);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.payment({
            destination: quote.quote.destination,
            asset,
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
      setStatusMessage(`payment submitted: ${submitted.hash.slice(0, 12)}…`);
    } catch (err) {
      console.error("freighter payment failed", err);
      setStatusMessage("payment failed: " + horizonErrorMessage(err));
    }
  }

  const isPaymentStatus = statusMessage === "pending payment" || statusMessage === "waiting for quote";
  const displayStatus = isPaymentStatus && orderStatus
    ? `${orderStatus.paymentStatus} / ${orderStatus.deliveryStatus}`
    : statusMessage;

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
          {missingTrustline && quote && (
            <button
              onClick={addTrustline}
              className="mt-3 border-2 border-outline px-6 py-3 font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface"
            >
              Add {quote.quote.asset.code} trustline
            </button>
          )}
          <p className="mt-4 text-on-surface" data-order-id={quote?.order.id} data-testid="payment-status">
            Status: {displayStatus}
          </p>
        </div>
      </div>
    </div>
  );
}
