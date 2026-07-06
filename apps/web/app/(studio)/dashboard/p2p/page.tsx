import { requirePrincipal, requireStudio } from "@/lib/auth/guards";
import { getStudioP2PListings, getStudioP2PTrades } from "@/lib/p2p-queries";
import type { P2PListingStatus, P2PTradeStatus } from "@xgamefi/shared/dto";

type SearchParams = {
  tab?: string;
  status?: string;
  page?: string;
  pageSize?: string;
};

const LISTING_STATUSES: readonly P2PListingStatus[] = ["ACTIVE", "LOCKED", "SOLD", "CANCELLED"];
const TRADE_STATUSES: readonly P2PTradeStatus[] = [
  "ESCROW_PENDING",
  "PAID",
  "ITEM_TRANSFERRED",
  "COMPLETED",
  "REFUNDED",
  "FAILED",
];

function parsePage(raw: string | undefined): number {
  return Math.max(1, parseInt(raw ?? "1", 10) || 1);
}

function parsePageSize(raw: string | undefined): number {
  return Math.min(100, Math.max(1, parseInt(raw ?? "25", 10) || 25));
}

function parseListingStatus(raw: string | undefined): P2PListingStatus | undefined {
  return LISTING_STATUSES.includes(raw as P2PListingStatus) ? (raw as P2PListingStatus) : undefined;
}

function parseTradeStatus(raw: string | undefined): P2PTradeStatus | undefined {
  return TRADE_STATUSES.includes(raw as P2PTradeStatus) ? (raw as P2PTradeStatus) : undefined;
}

function buildLink(search: URLSearchParams, updates: Record<string, string | undefined>): string {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  return `?${next.toString()}`;
}

function truncateHash(hash: string | null): string {
  return hash ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : "—";
}

function formatMoney(amount: string, currency: string): string {
  return `${amount} ${currency}`;
}

export default async function P2PManagementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePrincipal();
  const studioId = principal.kind === "user" ? principal.studioId : undefined;
  if (!studioId) {
    return (
      <p className="p-8 font-mono uppercase tracking-[0.1em] text-[12px] text-error">NO STUDIO CONTEXT</p>
    );
  }
  await requireStudio(studioId);

  const params = await searchParams;
  const tab = params.tab === "trades" ? "trades" : "listings";
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);

  const baseSearch = new URLSearchParams();
  if (tab !== "listings") baseSearch.set("tab", tab);

  let rows:
    | Awaited<ReturnType<typeof getStudioP2PListings>>["listings"]
    | Awaited<ReturnType<typeof getStudioP2PTrades>>["trades"];
  let total = 0;
  const activeStatus = params.status;

  if (tab === "trades") {
    const tradeStatus = parseTradeStatus(params.status);
    const result = await getStudioP2PTrades(studioId, {
      status: tradeStatus,
      page,
      pageSize,
    });
    rows = result.trades;
    total = result.total;
    if (tradeStatus) baseSearch.set("status", tradeStatus);
  } else {
    const listingStatus = parseListingStatus(params.status);
    const result = await getStudioP2PListings(studioId, {
      status: listingStatus,
      page,
      pageSize,
    });
    rows = result.listings;
    total = result.total;
    if (listingStatus) baseSearch.set("status", listingStatus);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <section className="flex flex-col gap-6 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[48px] leading-[52px] font-bold tracking-[-0.02em] text-on-surface">
            P2P Marketplace
          </h1>
          <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">
            MANAGE LISTINGS AND TRADES · {total} TOTAL
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={buildLink(baseSearch, { tab: "listings", status: undefined, page: "1" })}
          className={`px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] border-2 ${
            tab === "listings"
              ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed"
              : "bg-surface-container text-on-surface border-outline-variant"
          }`}
        >
          Listings
        </a>
        <a
          href={buildLink(baseSearch, { tab: "trades", status: undefined, page: "1" })}
          className={`px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] border-2 ${
            tab === "trades"
              ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed"
              : "bg-surface-container text-on-surface border-outline-variant"
          }`}
        >
          Trades
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono uppercase tracking-[0.1em] text-[12px] text-outline">Filter:</span>
        <a
          href={buildLink(baseSearch, { status: undefined, page: "1" })}
          className={`px-3 py-1 font-mono uppercase tracking-[0.1em] text-[11px] border ${
            !activeStatus
              ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed"
              : "bg-surface-container-low text-on-surface border-outline-variant"
          }`}
        >
          All
        </a>
        {(tab === "trades" ? TRADE_STATUSES : LISTING_STATUSES).map((status) => (
          <a
            key={status}
            href={buildLink(baseSearch, { status, page: "1" })}
            className={`px-3 py-1 font-mono uppercase tracking-[0.1em] text-[11px] border ${
              activeStatus === status
                ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed"
                : "bg-surface-container-low text-on-surface border-outline-variant"
            }`}
          >
            {status.replace(/_/g, " ")}
          </a>
        ))}
      </div>

      {tab === "listings" ? (
        <div className="flex flex-col gap-3">
          {(rows as Awaited<ReturnType<typeof getStudioP2PListings>>["listings"]).map((listing) => (
            <div
              key={listing.id}
              className="bg-surface-container-low border-2 border-outline-variant p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-on-surface font-display text-lg">{listing.itemName}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                  Seller: {listing.sellerHandle ?? listing.sellerWallet}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-primary-fixed font-mono text-sm">
                  {formatMoney(listing.price.amount, listing.price.currency)}
                </span>
                <span aria-label="Listing status" className="px-2 py-1 bg-surface-container border border-outline-variant font-mono uppercase tracking-[0.1em] text-[11px] text-on-surface">
                  {listing.status}
                </span>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">No listings found.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(rows as Awaited<ReturnType<typeof getStudioP2PTrades>>["trades"]).map((trade) => (
            <div
              key={trade.id}
              className="bg-surface-container-low border-2 border-outline-variant p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-on-surface font-display text-lg">{trade.itemName}</span>
                <div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                  <span>Buyer: {trade.buyerWallet}</span>
                  <span>Seller: {trade.sellerWallet}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 font-mono text-sm">
                <span className="text-primary-fixed">{formatMoney(trade.price, trade.currency)}</span>
                <span className="text-on-surface-variant text-[11px]">Fee {formatMoney(trade.platformFeeAmount, trade.currency)}</span>
              </div>
              <div className="flex flex-col gap-2">
                <span aria-label="Trade status" className="px-2 py-1 bg-surface-container border border-outline-variant font-mono uppercase tracking-[0.1em] text-[11px] text-on-surface">
                  {trade.status}
                </span>
                <div className="font-mono text-[10px] text-on-surface-variant">
                  <div>Escrow: {truncateHash(trade.escrowTxHash)}</div>
                  <div>Payout: {truncateHash(trade.payoutTxHash)}</div>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="font-mono uppercase tracking-[0.1em] text-[12px] text-on-surface-variant">No trades found.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <a
          href={buildLink(baseSearch, { page: hasPrevious ? String(page - 1) : String(page) })}
          aria-disabled={!hasPrevious}
          className={`px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] border-2 ${
            hasPrevious
              ? "bg-surface-container text-on-surface border-outline-variant"
              : "bg-surface-container-low text-outline border-outline-variant pointer-events-none"
          }`}
        >
          Previous
        </a>
        <span className="font-mono text-[12px] text-on-surface-variant">
          Page {page} of {totalPages}
        </span>
        <a
          href={buildLink(baseSearch, { page: hasNext ? String(page + 1) : String(page) })}
          aria-disabled={!hasNext}
          className={`px-4 py-2 font-mono uppercase tracking-[0.1em] text-[12px] border-2 ${
            hasNext
              ? "bg-surface-container text-on-surface border-outline-variant"
              : "bg-surface-container-low text-outline border-outline-variant pointer-events-none"
          }`}
        >
          Next
        </a>
      </div>
    </section>
  );
}
