import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  DATABASE_URL: z.string().url(),
  SHADOW_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: boolFromString.default("true"),

  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),

  STUDIO_OWNER_USERNAME: z.string().min(1).default("studio"),
  STUDIO_OWNER_PASSWORD: z.string().min(1).default("change-me-studio"),

  STELLAR_NETWORK: z.enum(["testnet", "pubnet"]),
  STELLAR_HORIZON_URL: z.string().url(),
  STELLAR_RPC_URL: z.string().url(),
  STELLAR_RECEIVING_ACCOUNT: z.string().regex(/^G[A-Z2-7]{55}$/, "must be a Stellar G... public key"),
  STELLAR_PAYOUT_SIGNER_SECRET: z.string().min(1),
  STELLAR_USD_ASSET_CODE: z.string().min(1).max(12),
  STELLAR_USD_ASSET_ISSUER: z.string().regex(/^G[A-Z2-7]{55}$/, "must be a Stellar G... public key"),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000),

  REFERRAL_REWARD_AMOUNT: z.string().regex(/^\d+(\.\d{1,7})?$/).default("0.1"),
  REFERRAL_REWARD_CURRENCY: z.enum(["XLM", "USDT"]).optional(),

  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  WEBHOOK_TIMESTAMP_TOLERANCE_SEC: z.coerce.number().int().min(1).default(300),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return Object.freeze(result.data);
}

export const env: Env = parseEnv(process.env);
