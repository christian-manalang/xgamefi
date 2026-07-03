"use client";

import { useEffect, useRef, useState } from "react";
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
const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx";

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

function formatAmount(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export function CheckoutClient({ shop, item, referralCode, currency }: CheckoutClientProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("waiting for quote");
  const [orderStatus, setOrderStatus] = useState<{ paymentStatus: string; deliveryStatus: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [paymentUri, setPaymentUri] = useState<string | null>(null);
  const [freighterAvailable, setFreighterAvailable] = useState(false);
  const [missingTrustline, setMissingTrustline] = useState(false);
  const [sourceAddress, setSourceAddress] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    isConnected().then((r) => setFreighterAvailable(r.isConnected)).catch(() => setFreighterAvailable(false));
  }, []);

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const body: Record<string, unknown> = {
      itemId: item.id,
      currency: currency ?? item.price.currency,
    };
    if (referralCode) body.referralCode = referralCode;

    const connectEvents = (orderId: string) => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      const es = new EventSource(`/api/v1/orders/${orderId}/events`, { withCredentials: true });
      esRef.current = es;

      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as { paymentStatus?: string; deliveryStatus?: string };
          setOrderStatus((prev) => {
            const next = { paymentStatus: prev?.paymentStatus ?? "PENDING", deliveryStatus: prev?.deliveryStatus ?? "PENDING", ...payload };
            return next;
          });
          if (payload.deliveryStatus === "DELIVERED") {
            if (reconnectRef.current) {
              clearTimeout(reconnectRef.current);
              reconnectRef.current = null;
            }
            es.close();
            esRef.current = null;
          }
        } catch (err) {
          console.error("checkout events: failed to parse message", ev.data, err);
        }
      };

      es.onerror = () => {
        console.error("checkout events: EventSource dropped, reconnecting");
        es.close();
        esRef.current = null;
        reconnectRef.current = setTimeout(() => connectEvents(orderId), 1000);
      };
    };

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
        setPaymentUri(uri);
        QRCode.toDataURL(uri).then(setQr);

        connectEvents(data.order.id);
      })
      .catch((err) => {
        console.error("checkout quote failed", err);
        setStatusMessage("quote failed");
      });

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [item.id, item.price.currency, referralCode, currency]);

  async function copyUri() {
    if (!paymentUri) return;
    await navigator.clipboard.writeText(paymentUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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
      setTxHash(submitted.hash);
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
  const delivered = orderStatus?.deliveryStatus === "DELIVERED";

  return (
    <div className="container-max mx-auto px-4 py-12">
      <h1 className="font-display text-[48px] font-semibold text-on-surface mb-8">Checkout</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-surface-container-low border-2 border-outline-variant p-6 space-y-4">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="w-full aspect-video object-cover bg-surface-container-high" />
          ) : (
            <div className="w-full aspect-video bg-surface-container-high flex items-center justify-center font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">No Image</div>
          )}
          <div>
            <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mb-1">ITEM</p>
            <h2 className="font-display text-[24px] text-on-surface">{item.name}</h2>
          </div>
          <p className="font-display text-[32px] text-primary-fixed">
            {formatAmount(item.price.amount)} {item.price.currency}
          </p>
          <p className="text-on-surface-variant">{shop.slug} store</p>
        </div>
        <div className="bg-surface-container-low border-2 border-outline-variant p-6 flex flex-col items-center">
          {!quote ? (
            <div className="w-64 h-64 bg-surface-container-high animate-pulse flex items-center justify-center">
              <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">Loading quote…</span>
            </div>
          ) : qr ? (
            <img src={qr} alt="Payment QR" className="w-64 h-64" />
          ) : (
            <span className="text-on-surface-variant">Generating QR…</span>
          )}
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant mt-4">Scan with Freighter</p>
          {paymentUri && (
            <button
              onClick={copyUri}
              className="mt-2 border-2 border-outline-variant px-4 py-2 font-mono uppercase tracking-[0.1em] text-[10px] hover:border-primary-fixed"
            >
              {copied ? "COPIED" : "COPY PAYMENT URI"}
            </button>
          )}
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
          <div className="mt-4 text-center">
            {delivered ? (
              <div className="space-y-2">
                <p className="text-primary-fixed font-mono text-sm">DELIVERED ✓</p>
                {txHash && (
                  <a
                    href={`${EXPLORER_TX}/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block font-mono text-xs text-tertiary-fixed-dim hover:text-tertiary-fixed"
                  >
                    View transaction
                  </a>
                )}
              </div>
            ) : (
              <p className="text-on-surface" data-order-id={quote?.order.id} data-testid="payment-status">
                Status: {displayStatus}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
