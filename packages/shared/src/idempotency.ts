import { prisma, Prisma } from "@xgamefi/db";

export class IdempotencyConflictError extends Error {
  constructor(message = "idempotency key conflict") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export type RedisLike = {
  set(key: string, value: string, options?: { px?: number; nx?: boolean }): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

export async function withIdempotency<T>(
  args: { key: string; scope: string; requestHash: string },
  fn: () => Promise<T>,
  redis: RedisLike,
): Promise<T> {
  const lockKey = `idempotency-lock:${args.scope}:${args.key}`;
  const lockValue = `${Date.now()}`;
  const lockTtlMs = 30_000;

  const acquired = await redis.set(lockKey, lockValue, { px: lockTtlMs, nx: true });
  if (acquired !== "OK") {
    throw new IdempotencyConflictError("idempotency key already in progress");
  }

  try {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: args.key } });
    if (existing) {
      if (existing.requestHash !== args.requestHash) {
        throw new IdempotencyConflictError();
      }
      return existing.responseSnapshot as T;
    }

    const result = await fn();
    await prisma.idempotencyKey.create({
      data: {
        key: args.key,
        scope: args.scope,
        requestHash: args.requestHash,
        responseSnapshot: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  } finally {
    await redis.del(lockKey);
  }
}
