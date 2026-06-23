import { NextResponse } from "next/server";
import { prisma } from "@xgamefi/db";
import { pingRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = "fail";
  let redis = "fail";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "fail";
  }
  try {
    redis = (await pingRedis()) ? "ok" : "fail";
  } catch {
    redis = "fail";
  }
  const ok = db === "ok" && redis === "ok";
  return NextResponse.json({ db, redis }, { status: ok ? 200 : 503 });
}
