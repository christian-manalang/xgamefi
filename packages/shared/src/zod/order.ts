import { z } from "zod";

export const OrderEventsParams = z.object({
  id: z.string().uuid(),
});
export type OrderEventsParams = z.infer<typeof OrderEventsParams>;

export const PlayerOrdersQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PlayerOrdersQuery = z.infer<typeof PlayerOrdersQuery>;
