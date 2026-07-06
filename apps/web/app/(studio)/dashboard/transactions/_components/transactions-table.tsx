"use client";

import { useState } from "react";
import type { StudioOrderListItem } from "@/lib/order-queries";

const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"];
const DELIVERY_STATUSES = ["PENDING", "DELIVERED", "FAILED"];

export function TransactionsTable({
  studioId,
  explorerBaseUrl,
  initial,
  initialCursor,
}: {
  studioId: string;
  explorerBaseUrl: string;
  initial: StudioOrderListItem[];
  initialCursor: string | null;
}) {
  const [orders, setOrders] = useState(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(nextCursor?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (deliveryStatus) params.set("deliveryStatus", deliveryStatus);
    if (nextCursor) params.set("cursor", nextCursor);
    params.set("limit", "50");
    const res = await fetch(`/api/v1/studios/${studioId}/orders?${params.toString()}`);
    const json = await res.json().catch(() => ({ data: [], nextCursor: null }));
    setLoading(false);
    if (res.ok) {
      if (nextCursor) {
        setOrders((prev) => [...prev, ...json.data]);
      } else {
        setOrders(json.data);
      }
      setCursor(json.nextCursor);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={paymentStatus}
          onChange={(e) => {
            setPaymentStatus(e.target.value);
            load();
          }}
          className="bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed"
        >
          <option value="">ALL PAYMENT STATUSES</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={deliveryStatus}
          onChange={(e) => {
            setDeliveryStatus(e.target.value);
            load();
          }}
          className="bg-surface-container-low border-2 border-outline-variant text-on-surface font-mono uppercase tracking-[0.05em] text-[12px] px-3 py-2 outline-none focus:border-primary-fixed"
        >
          <option value="">ALL DELIVERY STATUSES</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-outline-variant font-mono text-sm">
        {orders.map((o) => (
          <li key={o.id} className="py-3 grid grid-cols-1 md:grid-cols-6 gap-2">
            <span className="truncate" title={o.playerWallet}>
              {o.playerWallet.slice(0, 12)}…
            </span>
            <span className="text-on-surface">{o.itemName}</span>
            <span className="text-on-surface-variant">{o.quantity}×</span>
            <span className="text-primary-fixed">
              {o.grossAmount} {o.currency}
            </span>
            <span className="text-on-surface-variant">
              {o.paymentStatus} / {o.deliveryStatus}
            </span>
            <span className="text-on-surface-variant md:text-right">
              {o.stellarTxHash ? (
                <a
                  href={`${explorerBaseUrl}/${o.stellarTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary-fixed focus:outline-none focus:ring-2 focus:ring-primary-fixed"
                >
                  {o.stellarTxHash.slice(0, 12)}…
                </a>
              ) : (
                "—"
              )}
            </span>
          </li>
        ))}
      </ul>

      {orders.length === 0 && !loading && (
        <p className="text-on-surface-variant font-mono text-sm">No transactions found.</p>
      )}

      {cursor && (
        <button
          onClick={() => load(cursor)}
          disabled={loading}
          className="mt-4 border-2 border-outline-variant px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] hover:border-primary-fixed disabled:opacity-50"
        >
          {loading ? "LOADING..." : "LOAD MORE"}
        </button>
      )}
    </div>
  );
}
