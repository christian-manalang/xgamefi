import { z } from "zod";

export const OrderEventsParams = z.object({
  id: z.string().uuid(),
});
export type OrderEventsParams = z.infer<typeof OrderEventsParams>;

export const StudioOrdersQuery = z
  .object({
    paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
    deliveryStatus: z.enum(["PENDING", "DELIVERED", "FAILED"]).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type StudioOrdersQueryT = z.infer<typeof StudioOrdersQuery>;

export const PlayerOrdersQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PlayerOrdersQuery = z.infer<typeof PlayerOrdersQuery>;
