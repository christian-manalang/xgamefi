import { Horizon } from "@stellar/stellar-sdk";
import { prisma } from "@xgamefi/db";
import { env } from "@xgamefi/config/env";
import { verifyAndAdvanceOrder } from "@xgamefi/shared/settlement";
import { getRedis } from "@xgamefi/shared/queues";

const CURSOR_KEY = "stellar-watcher:cursor";
const POLL_LIMIT = 200;

export type StellarWatcherJobData = { cursor?: string };

const STELLAR_TEXT_MEMO_MAX_BYTES = 28;

function truncateTextMemo(memo: string): string {
  const buf = Buffer.from(memo, "utf8");
  if (buf.length <= STELLAR_TEXT_MEMO_MAX_BYTES) return memo;
  let end = STELLAR_TEXT_MEMO_MAX_BYTES;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

export function matchAndAdvancePayments(
  orders: { id: string }[],
  payments: { memo?: string; txHash?: string }[],
): { id: string; txHash: string }[] {
  const pendingIds = new Map(orders.map((o) => [truncateTextMemo(o.id), o.id]));
  const matched: { id: string; txHash: string }[] = [];
  for (const p of payments) {
    if (p.memo && pendingIds.has(p.memo) && p.txHash) {
      matched.push({ id: pendingIds.get(p.memo)!, txHash: p.txHash });
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

  const response = await account.call();
  console.log(`stellar-watcher: fetched ${response.records.length} payment records, cursor=${cursor ?? "none"}`);
  const payments: { memo?: string; txHash?: string }[] = [];
  let nextCursor: string | undefined;

  for (const record of response.records) {
    nextCursor = record.paging_token;
    try {
      const tx = await server.transactions().transaction(record.transaction_hash).call();
      payments.push({ memo: tx.memo, txHash: tx.hash });
    } catch (err) {
      console.error(`stellar-watcher: failed to fetch transaction ${record.transaction_hash}`, err);
    }
  }

  const pendingOrders = await prisma.order.findMany({
    where: { paymentStatus: "PENDING" },
    select: { id: true },
  });
  console.log(`stellar-watcher: ${pendingOrders.length} pending orders, ${payments.length} payments with memos`);

  const matched = matchAndAdvancePayments(pendingOrders, payments);
  console.log(`stellar-watcher: matched ${matched.length} orders`);
  let processed = 0;
  for (const m of matched) {
    try {
      console.log(`stellar-watcher: advancing order ${m.id} tx=${m.txHash}`);
      const res = await verifyAndAdvanceOrder({ orderId: m.id, txHash: m.txHash });
      console.log(`stellar-watcher: advance result ${res.status}`);
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
