import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth/guards";
import { prisma } from "@xgamefi/db";
import { OrderEventsParams } from "@xgamefi/shared/zod/order";
import { getRedis } from "@xgamefi/shared/queues";
import { createSseStream } from "../../../../../../lib/sse";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requirePrincipal();
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

  const channel = `order-events:${id}`;
  const redis = getRedis();
  const stream = createSseStream(channel, redis);

  const initial = JSON.stringify({ paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus });
  const encoder = new TextEncoder();
  const combined = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${initial}\n\n`));
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    },
  });

  return new Response(combined, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
