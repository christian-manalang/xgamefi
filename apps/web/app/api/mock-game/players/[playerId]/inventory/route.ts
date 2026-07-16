import { NextResponse } from "next/server";

// Item transfer target called by P2P settlement after escrow payment. The mock
// keeps no inventory state — the platform's ItemOwnership mirror drives the UI.
export async function POST(_req: Request): Promise<Response> {
  return NextResponse.json({ ok: true });
}
