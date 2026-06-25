import { z } from "zod";

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "invalid Stellar address");

export const AdminSettingsInput = z
  .object({
    defaultFeeBps: z.number().int().min(0).max(10000).optional(),
    receivingAccount: stellarAddress.optional(),
    payoutSignerPublic: stellarAddress.optional(),
    usdAssetCode: z.string().min(1).max(12).optional(),
    usdAssetIssuer: stellarAddress.optional(),
    network: z.enum(["testnet", "pubnet"]).optional(),
  })
  .strict();

export type AdminSettingsInputT = z.infer<typeof AdminSettingsInput>;
