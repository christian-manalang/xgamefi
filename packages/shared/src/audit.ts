import { prisma, Prisma } from "@xgamefi/db";

const REDACT = /pass|secret|token|signature|hash|nonce/i;

function sanitize(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

export async function writeAudit(args: {
  actorType: "USER" | "PLAYER" | "ANON";
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  ip: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: args.actorType,
      actorUserId: args.actorUserId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      ip: args.ip,
      metadata: sanitize(args.metadata) as Prisma.InputJsonValue,
    },
  });
}
