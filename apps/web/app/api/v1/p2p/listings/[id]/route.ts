import { NextResponse } from "next/server";
import { prisma } from "@xgamefi/db";
import { toP2PListingDto } from "@xgamefi/shared/dto";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const row = await prisma.p2PListing.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ listing: toP2PListingDto(row) }, { status: 200 });
}
