import { z } from "zod";

export const OrderEventsParams = z.object({
  id: z.string().uuid(),
});
export type OrderEventsParams = z.infer<typeof OrderEventsParams>;
