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
