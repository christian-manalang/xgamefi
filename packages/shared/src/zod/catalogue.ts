import { z } from "zod";

const numericString = z.string().regex(/^\d+(\.\d{1,7})?$/, "must be a numeric amount");
const currency = z.enum(["XLM", "USDT"]);

export const RemoteItem = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  imageUrl: z.string().url().nullish(),
  price: numericString,
  currency,
  stock: z.number().int().nonnegative().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});
export type RemoteItem = z.infer<typeof RemoteItem>;

export const RemoteItemsSchema = z.array(RemoteItem);

export const ItemOverrideInput = z
  .object({
    priceAmount: numericString.optional(),
    priceCurrency: currency.optional(),
    stock: z.number().int().nonnegative().nullable().optional(),
    saleStartsAt: z.string().datetime().nullable().optional(),
    saleEndsAt: z.string().datetime().nullable().optional(),
    featured: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field required" });
export type ItemOverrideInput = z.infer<typeof ItemOverrideInput>;

export const ShopItemsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().min(1).optional(),
  rarity: z.string().min(1).optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(60).default(24),
});
export type ShopItemsQuery = z.infer<typeof ShopItemsQuery>;
