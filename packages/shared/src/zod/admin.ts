import { z } from "zod";

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "invalid Stellar address");

export const AdminSettingsInput = z
  .object({
    defaultFeeBps: z.number().int().min(0).max(10000).optional(),
    receivingAccount: stellarAddress.nullable().optional(),
    payoutSignerPublic: stellarAddress.nullable().optional(),
    usdAssetCode: z.string().min(1).max(12).optional(),
    usdAssetIssuer: stellarAddress.nullable().optional(),
    network: z.enum(["testnet", "pubnet"]).optional(),
  })
  .strict();

export type AdminSettingsInputT = z.infer<typeof AdminSettingsInput>;

export const AdminLedgerQuery = z
  .object({
    type: z.string().optional(),
    studioId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().uuid().optional(),
  })
  .strict();

export type AdminLedgerQueryT = z.infer<typeof AdminLedgerQuery>;

export const StudioOnboardInput = z
  .object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().optional(),
    payoutWalletAddress: stellarAddress.optional(),
    integrationMode: z.enum(["API_PULL", "WEBHOOK_PUSH"]).default("API_PULL"),
    apiBaseUrl: z.string().url().optional(),
  })
  .strict();

export type StudioOnboardInputT = z.infer<typeof StudioOnboardInput>;

export const StudioPatchInput = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    logoUrl: z.string().url().nullable().optional(),
    brand: z.record(z.any()).nullable().optional(),
    payoutWalletAddress: stellarAddress.nullable().optional(),
    platformFeeBps: z.number().int().min(0).max(10000).optional(),
    referralRewardAmount: z
      .string()
      .regex(/^\d+(\.\d{1,7})?$/)
      .nullable()
      .optional(),
    referralRewardCurrency: z.enum(["XLM", "USDT"]).nullable().optional(),
    integrationMode: z.enum(["API_PULL", "WEBHOOK_PUSH"]).nullable().optional(),
    apiBaseUrl: z.string().url().nullable().optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]).optional(),
  })
  .strict();

export type StudioPatchInputT = z.infer<typeof StudioPatchInput>;

export const IssueApiKeyInput = z
  .object({
    scopes: z.array(z.string()).default(["ingest"]),
  })
  .strict();

export type IssueApiKeyInputT = z.infer<typeof IssueApiKeyInput>;

export const WebhookConfigInput = z
  .object({
    url: z.string().url(),
  })
  .strict();

export type WebhookConfigInputT = z.infer<typeof WebhookConfigInput>;

export const WebhookTestInput = z
  .object({
    event: z
      .enum([
        "purchase.completed",
        "purchase.pending",
        "purchase.failed",
        "p2p.trade.completed",
      ])
      .default("purchase.completed"),
  })
  .strict();

export type WebhookTestInputT = z.infer<typeof WebhookTestInput>;

export const AdminUserUpdateInput = z
  .object({
    role: z.enum(["ADMIN", "STUDIO_OWNER", "STUDIO_MEMBER"]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type AdminUserUpdateInputT = z.infer<typeof AdminUserUpdateInput>;

