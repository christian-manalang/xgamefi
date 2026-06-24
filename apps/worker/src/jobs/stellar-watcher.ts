import { Horizon } from "@stellar/stellar-sdk";
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { getRedis } from "@xgamefi/shared/queues";

const CURSOR_KEY = "stellar-watcher:cursor";
const POLL_LIMIT = 200;

export type StellarWatcherJobData = { cursor?: string };

export function matchAndAdvancePayments(
  orders: { id: string }[],
  payments: { memo?: string; txHash?: string }[],
): { id: string; txHash: string }[] {
  const pendingIds = new Set(orders.map((o) => o.id));
  const matched: { id: string; txHash: string }[] = [];
  for (const p of payments) {
    if (p.memo && pendingIds.has(p.memo) && p.txHash) {
      matched.push({ id: p.memo, txHash: p.txHash });
    }
  }
  return matched;
}

export async function stellarWatcherProcessor(job: { data: StellarWatcherJobData }): Promise<{ processed: number; cursor?: string }> {
  const redis = getRedis();
  const server = new Horizon.Server(env.STELLAR_HORIZON_URL);
  const account = server.payments().forAccount(env.STELLAR_RECEIVING_ACCOUNT).limit(POLL_LIMIT).order("asc");

  const cursor = job.data.cursor ?? (await redis.get(CURSOR_KEY)) ?? undefined;
  if (cursor) account.cursor(cursor);

  const payments: { memo?: string; txHash?: string }[] = [];
  let nextCursor: string | undefined;

  const response = await account.call();
  for (const record of response.records) {
    payments.push({ memo: (record as { transaction_memo?: string }).transaction_memo, txHash: record.transaction_hash });
    nextCursor = record.paging_token;
  }

  const pendingOrders = await prisma.order.findMany({
    where: { paymentStatus: "PENDING" },
    select: { id: true },
  });

  const matched = matchAndAdvancePayments(pendingOrders, payments);
  let processed = 0;
  for (const m of matched) {
    try {
      const res = await verifyAndAdvanceOrder({ orderId: m.id, txHash: m.txHash });
      if (res.status === "PAID" || res.status === "ALREADY") processed++;
    } catch (err) {
      console.error(`stellar-watcher: failed to advance ${m.id}`, err);
    }
  }

  if (nextCursor) {
    await redis.set(CURSOR_KEY, nextCursor);
  }

  return { processed, cursor: nextCursor };
}
