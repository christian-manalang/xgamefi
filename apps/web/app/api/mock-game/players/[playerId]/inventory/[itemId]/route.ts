import { NextResponse } from "next/server";

// Ownership check used by P2P listing flow. Every player owns every item so
// any seeded item can be listed locally; a real studio API answers from its
// own inventory state.
export async function GET(): Promise<Response> {
  return NextResponse.json({ quantity: 1 });
}
