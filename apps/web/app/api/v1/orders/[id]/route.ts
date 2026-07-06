import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { prisma } from "@xgamefi/db";
import { OrderEventsParams } from "@xgamefi/shared/zod/order";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let principal;
  try {
    principal = await requirePrincipal();
  } catch (e) {
    console.error("[order-status] auth failed", e);
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = OrderEventsParams.parse(await ctx.params);

  const order = await prisma.order.findUnique({
    where: { id },
    select: { playerId: true, paymentStatus: true, deliveryStatus: true },
  });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isOwner = principal.kind === "player" && principal.playerId === order.playerId;
  const isAdmin = principal.kind === "user" && principal.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus });
}
