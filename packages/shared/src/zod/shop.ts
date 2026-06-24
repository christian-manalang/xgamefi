import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");

export const ShopSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  itemIds: z.array(z.string().uuid()),
});
export type ShopSection = z.infer<typeof ShopSectionSchema>;

export const ShopLayoutSchema = z.object({
  mode: z.enum(["grid", "list"]),
  sections: z.array(ShopSectionSchema).max(24),
});
export type ShopLayout = z.infer<typeof ShopLayoutSchema>;

export const ShopThemeSchema = z.object({
  primary: hexColor.optional(),
  secondary: hexColor.optional(),
  background: hexColor.optional(),
  logoUrl: z.string().url().optional(),
});
export type ShopTheme = z.infer<typeof ShopThemeSchema>;

export const ShopDraftInputSchema = z.object({
  layout: ShopLayoutSchema,
  theme: ShopThemeSchema,
  featuredItemIds: z.array(z.string().uuid()).max(24),
});
export type ShopDraftInput = z.infer<typeof ShopDraftInputSchema>;
