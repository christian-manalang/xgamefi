import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("X-XGameFi-Signature");
    const timestamp = req.headers.get("X-XGameFi-Timestamp");

    console.log("[mock-game webhook] Received webhook");
    console.log("[mock-game webhook] Timestamp:", timestamp);
    console.log("[mock-game webhook] Signature:", signature?.slice(0, 20) + "...");
    console.log("[mock-game webhook] Body:", rawBody);

    const body = JSON.parse(rawBody);
    console.log("[mock-game webhook] Event:", body.event);
    if (body.order) {
      console.log("[mock-game webhook] Order ID:", body.order.id);
      console.log("[mock-game webhook] Item ID:", body.order.itemId);
      console.log("[mock-game webhook] Player ID:", body.order.playerId);
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error("[mock-game webhook] Error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
