import { NextResponse } from "next/server";
import { prisma } from "@xgamefi/db";
import { P2PListingsQuery } from "@xgamefi/shared/zod/p2p";
import { toP2PListingDto } from "@xgamefi/shared/dto";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const parsed = P2PListingsQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid query" }, { status: 400 });

  const shop = await prisma.shop.findFirst({ where: { studio: { slug }, status: "PUBLISHED" }, select: { studioId: true } });
  if (!shop) {
    return NextResponse.json({ listings: [], total: 0, page: parsed.data.page, pageSize: parsed.data.pageSize }, { status: 200 });
  }

  const where = { studioId: shop.studioId, status: "ACTIVE" as const };

  const [rows, total] = await Promise.all([
    prisma.p2PListing.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (parsed.data.page - 1) * parsed.data.pageSize,
      take: parsed.data.pageSize,
    }),
    prisma.p2PListing.count({ where }),
  ]);

  return NextResponse.json(
    {
      listings: rows.map(toP2PListingDto),
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
    { status: 200 },
  );
}
