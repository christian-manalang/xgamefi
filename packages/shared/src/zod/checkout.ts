import { z } from "zod";

export const CheckoutQuoteInput = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  currency: z.enum(["XLM", "USDT"]).optional(),
  referralCode: z.string().min(4).max(32).regex(/^[A-Z0-9]+$/).optional(),
});
export type CheckoutQuoteInput = z.infer<typeof CheckoutQuoteInput>;

export const CheckoutSubmitInput = z.object({
  orderId: z.string().uuid(),
  txHash: z.string().min(1),
});
export type CheckoutSubmitInput = z.infer<typeof CheckoutSubmitInput>;
