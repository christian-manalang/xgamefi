"use client";

import { useCallback, useEffect, useState } from "react";

type Shop = { slug: string; name: string; logoUrl: string | null };

export function BrowseShops() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchShops = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/shops");
      if (res.ok) {
        const json = (await res.json()) as { shops: Shop[] };
        setShops(json.shops);
      }
    } catch {
      setShops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && shops.length === 0) {
      fetchShops();
    }
  }, [open, shops.length, fetchShops]);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary-fixed text-on-primary-fixed font-mono uppercase tracking-[0.1em] text-[12px] px-6 py-3 hover:bg-primary-fixed-dim transition-colors"
      >
        Browse Shops
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="border-2 border-outline-variant bg-surface-container-low p-8 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-mono uppercase tracking-[0.1em] text-[12px] text-primary-fixed">
                Available Shops
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant hover:text-primary-fixed transition-colors"
              >
                Close
              </button>
            </div>

            {loading ? (
              <p className="font-mono text-[12px] text-on-surface-variant uppercase tracking-[0.1em]">
                Loading…
              </p>
            ) : shops.length === 0 ? (
              <p className="font-mono text-[12px] text-on-surface-variant uppercase tracking-[0.1em]">
                No shops available
              </p>
            ) : (
              <ul className="space-y-3">
                {shops.map((shop) => (
                  <li key={shop.slug}>
                    <a
                      href={`/s/${shop.slug}`}
                      className="flex items-center gap-3 p-3 border-2 border-outline-variant hover:border-primary-fixed transition-colors group"
                    >
                      {shop.logoUrl ? (
                        <img
                          src={shop.logoUrl}
                          alt={shop.name}
                          className="w-10 h-10 object-contain"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-surface-container flex items-center justify-center">
                          <span className="font-mono text-[10px] text-outline uppercase">
                            {shop.name.slice(0, 2)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface group-hover:text-primary-fixed transition-colors">
                          {shop.name}
                        </span>
                        <span className="block font-mono text-[10px] text-on-surface-variant uppercase tracking-[0.1em]">
                          /s/{shop.slug}
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
