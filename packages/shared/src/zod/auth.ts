import { z } from "zod";

const stellarPublicKey = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "must be a Stellar public key (G..., 56 chars)");

export const LoginInput = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(512),
});

export const WalletChallengeInput = z.object({
  walletAddress: stellarPublicKey,
});

export const WalletVerifyInput = z.object({
  walletAddress: stellarPublicKey,
  signature: z.string().min(1).max(2048),
});

const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens");

export const StudioSelfOnboardInput = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(8).max(512),
    confirmPassword: z.string().min(1).max(512),
    studioName: z.string().min(1).max(120),
    slug,
    payoutWalletAddress: stellarPublicKey.optional(),
    integrationMode: z.enum(["API_PULL", "WEBHOOK_PUSH"]).default("API_PULL"),
    apiBaseUrl: z.string().url().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "passwords do not match",
    path: ["confirmPassword"],
  });
export type StudioSelfOnboardInput = z.infer<typeof StudioSelfOnboardInput>;
