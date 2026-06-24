import { z } from "zod";

const numericString = z.string().regex(/^\d+(\.\d{1,7})?$/, "must be a numeric amount");

export const CreateListingInput = z.object({
  itemId: z.string().uuid(),
  price: numericString,
  currency: z.enum(["XLM", "USDT"]),
});
export type CreateListingInput = z.infer<typeof CreateListingInput>;

export const P2PTradeQuoteInput = z.object({
  listingId: z.string().uuid(),
});
export type P2PTradeQuoteInput = z.infer<typeof P2PTradeQuoteInput>;

export const P2PTradeSubmitInput = z.object({
  tradeId: z.string().uuid(),
  txHash: z.string().min(1),
});
export type P2PTradeSubmitInput = z.infer<typeof P2PTradeSubmitInput>;

export const P2PListingsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().min(1).optional(),
  rarity: z.string().min(1).optional(),
  currency: z.enum(["XLM", "USDT"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(60).default(24),
});
export type P2PListingsQuery = z.infer<typeof P2PListingsQuery>;
