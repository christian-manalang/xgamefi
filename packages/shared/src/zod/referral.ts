import { z } from "zod";

export const ReferralBindInput = z.object({
  code: z.string().min(4).max(32).regex(/^[A-Z0-9]+$/, "code is uppercase alphanumeric"),
});

export type ReferralBindInputT = z.infer<typeof ReferralBindInput>;
