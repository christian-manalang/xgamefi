import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,7})?$/, "must be a decimal with <=7dp");
const promoCode = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, "letters, numbers, dashes, underscores only");

export const BundleConfigSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  bundlePrice: decimalString,
});

export const CreatePromotionInput = z.object({
  name: z.string().min(1).max(120),
  code: promoCode.nullable().optional(),
  type: z.enum(["PERCENT", "FIXED", "BUNDLE", "FIRST_PURCHASE"]),
  value: decimalString,
  currency: z.enum(["XLM", "USDT"]).nullable().optional(),
  appliesToItemIds: z.array(z.string().uuid()).default([]),
  bundleConfig: BundleConfigSchema.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.type === "BUNDLE" && !v.bundleConfig) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "BUNDLE requires bundleConfig", path: ["bundleConfig"] });
  }
  if (v.startsAt && v.endsAt && Date.parse(v.startsAt) > Date.parse(v.endsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "startsAt must be <= endsAt", path: ["endsAt"] });
  }
});

export const UpdatePromotionInput = z.object({
  name: z.string().min(1).max(120).optional(),
  code: promoCode.nullable().optional(),
  value: decimalString.optional(),
  currency: z.enum(["XLM", "USDT"]).nullable().optional(),
  appliesToItemIds: z.array(z.string().uuid()).optional(),
  bundleConfig: BundleConfigSchema.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreatePromotionInputT = z.infer<typeof CreatePromotionInput>;
export type UpdatePromotionInputT = z.infer<typeof UpdatePromotionInput>;
