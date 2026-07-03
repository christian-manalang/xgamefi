import { NextResponse } from "next/server";
import { requireStudio } from "@/lib/auth/guards";
import { getStudioP2PListings, getStudioP2PTrades } from "@/lib/p2p-queries";
import type { P2PListingStatus, P2PTradeStatus } from "@xgamefi/shared/dto";

const LISTING_STATUSES: readonly P2PListingStatus[] = ["ACTIVE", "LOCKED", "SOLD", "CANCELLED"];
const TRADE_STATUSES: readonly P2PTradeStatus[] = [
  "ESCROW_PENDING",
  "PAID",
  "ITEM_TRANSFERRED",
  "COMPLETED",
  "REFUNDED",
  "FAILED",
];

function parsePagination(url: URL): { page: number; pageSize: number } {
  const rawPage = url.searchParams.get("page");
  const rawPageSize = url.searchParams.get("pageSize");
  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize ?? "25", 10) || 25));
  return { page, pageSize };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: studioId } = await ctx.params;
  await requireStudio(studioId);

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "trades" ? "trades" : "listings";
  const { page, pageSize } = parsePagination(url);
  const rawStatus = url.searchParams.get("status") ?? undefined;

  if (tab === "trades") {
    const status = TRADE_STATUSES.includes(rawStatus as P2PTradeStatus)
      ? (rawStatus as P2PTradeStatus)
      : undefined;
    const result = await getStudioP2PTrades(studioId, { status, page, pageSize });
    return NextResponse.json(result, { status: 200 });
  }

  const status = LISTING_STATUSES.includes(rawStatus as P2PListingStatus)
    ? (rawStatus as P2PListingStatus)
    : undefined;
  const result = await getStudioP2PListings(studioId, { status, page, pageSize });
  return NextResponse.json(result, { status: 200 });
}
