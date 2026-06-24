import { Horizon } from "@stellar/stellar-sdk";
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyAndAdvanceP2PTrade, transferItemAndPayout } from "@xgamefi/shared/p2p/settlement";
import { getRedis } from "@xgamefi/shared/queues";

export type P2PSettlementJobData =
  | { tradeId: string; phase: "verify" | "transfer" }
  | { cursor?: string };

const CURSOR_KEY = "p2p-settlement:cursor";
const POLL_LIMIT = 200;

export async function p2pSettlementProcessor(job: { data: P2PSettlementJobData }): Promise<{ status: string }> {
  if ("phase" in job.data && job.data.phase === "transfer") {
    return transferItemAndPayout({ tradeId: job.data.tradeId });
  }

  // Verify phase: poll Horizon for escrow payments matching ESCROW_PENDING trade memos.
  const redis = getRedis();
  const server = new Horizon.Server(env.STELLAR_HORIZON_URL);
  const account = server.payments().forAccount(env.STELLAR_RECEIVING_ACCOUNT).limit(POLL_LIMIT).order("asc");
  const cursor = ("cursor" in job.data ? job.data.cursor : undefined) ?? (await redis.get(CURSOR_KEY)) ?? undefined;
  if (cursor) account.cursor(cursor);

  const response = await account.call();
  const pendingTrades = await prisma.p2PTrade.findMany({
    where: { status: "ESCROW_PENDING" },
    select: { id: true },
  });
  const pendingIds = new Set(pendingTrades.map((t) => t.id));

  let nextCursor: string | undefined;
  for (const record of response.records) {
    nextCursor = record.paging_token;
    const memo = (record as { transaction_memo?: string }).transaction_memo;
    if (memo && pendingIds.has(memo)) {
      try {
        await verifyAndAdvanceP2PTrade({ tradeId: memo, txHash: record.transaction_hash });
      } catch (err) {
        console.error(`p2p-settlement: verify failed for ${memo}`, err);
      }
    }
  }

  if (nextCursor) await redis.set(CURSOR_KEY, nextCursor);
  return { status: "ok" };
}
