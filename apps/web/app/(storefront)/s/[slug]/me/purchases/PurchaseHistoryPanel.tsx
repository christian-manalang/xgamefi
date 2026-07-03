"use client";

import { useEffect, useState } from "react";
import type { OrderDto } from "@xgamefi/shared/dto";

type ItemSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
};

type PlayerOrder = OrderDto & { item: ItemSummary };

const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx";

function formatStatus(order: PlayerOrder): string {
  return `${order.paymentStatus} / ${order.deliveryStatus}`;
}

export function PurchaseHistoryPanel({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<PlayerOrder[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/shops/${slug}/orders/me?page=${page}&pageSize=${pageSize}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error("Connect your wallet to view purchases.");
          }
          throw new Error("Unable to load purchase history.");
        }
        const data = (await res.json()) as { orders: PlayerOrder[]; total: number };
        if (!cancelled) {
          setOrders(data.orders);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, page, pageSize]);

  if (loading) {
    return (
      <section className="bg-surface-container-low border-2 border-outline-variant p-6" aria-busy="true" aria-label="Loading purchases">
        <div className="h-32 bg-surface-container-high animate-pulse flex items-center justify-center">
          <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">SYNCING_PURCHASES…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-surface-container-low border-2 border-outline-variant p-6">
        <p className="text-error font-mono uppercase tracking-[0.1em] text-[12px]" data-testid="purchase-error">
          {error}
        </p>
      </section>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <section className="bg-surface-container-low border-2 border-outline-variant p-10 text-center">
        <h2 className="font-mono uppercase tracking-[0.1em] text-on-surface-variant text-xs mb-3">PURCHASE_HISTORY</h2>
        <p className="font-display text-[24px] text-on-surface mb-2">No purchases yet.</p>
        <p className="text-on-surface-variant text-sm">Items you buy from this shop will appear here.</p>
      </section>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="bg-surface-container-low border-2 border-outline-variant p-6 space-y-6">
      <h2 className="font-mono uppercase tracking-[0.1em] text-on-surface-variant text-xs">PURCHASE_HISTORY</h2>

      <ul className="space-y-4" data-testid="purchase-list">
        {orders.map((order) => (
          <li
            key={order.id}
            className="border-2 border-outline-variant p-4 bg-surface-container-lowest"
          >
            <div className="flex flex-col sm:flex-row gap-4">
              {order.item.imageUrl ? (
                <img
                  src={order.item.imageUrl}
                  alt={order.item.name}
                  className="w-full sm:w-32 aspect-square object-cover bg-surface-container-high"
                />
              ) : (
                <div className="w-full sm:w-32 aspect-square bg-surface-container-high flex items-center justify-center">
                  <span className="font-mono uppercase tracking-[0.1em] text-[10px] text-on-surface-variant">No Image</span>
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">ITEM</p>
                  <p className="font-display text-[20px] text-on-surface truncate">{order.item.name}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">AMOUNT</p>
                    <p className="font-display text-[18px] text-primary-fixed">
                      {order.grossAmount} {order.currency}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">QTY</p>
                    <p className="font-mono text-[14px] text-on-surface">{order.quantity}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">STATUS</p>
                    <p className="font-mono text-[12px] text-on-surface">{formatStatus(order)}</p>
                  </div>
                </div>
                {order.stellarTxHash && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">TX HASH</p>
                    <a
                      href={`${EXPLORER_TX}/${order.stellarTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[12px] text-tertiary-fixed-dim hover:text-tertiary-fixed break-all"
                    >
                      {order.stellarTxHash}
                    </a>
                  </div>
                )}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-outline">DATE</p>
                  <p className="font-mono text-[12px] text-on-surface-variant" data-testid="purchase-date">
                    {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between pt-4 border-t-2 border-outline-variant" aria-label="Purchase pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface hover:border-primary-fixed disabled:opacity-50 disabled:hover:border-outline-variant transition-colors"
          >
            ← Previous
          </button>
          <span className="font-mono text-[12px] text-on-surface-variant">
            PAGE {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface hover:border-primary-fixed disabled:opacity-50 disabled:hover:border-outline-variant transition-colors"
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}
