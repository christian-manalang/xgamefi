import type { CSSProperties } from "react";

export interface BrandOverride {
  primary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  displayFont?: string;
  monoFont?: string;
}

const BRAND_CSS_MAP: Record<keyof BrandOverride, string> = {
  primary: "--color-primary-fixed",
  accent: "--color-secondary",
  background: "--color-background",
  surface: "--color-surface",
  displayFont: "--font-display",
  monoFont: "--font-mono",
};

export function brandToCssVars(brand: Record<string, unknown> | null): CSSProperties {
  const vars: Record<string, string> = {};
  if (!brand) return vars as CSSProperties;

  for (const [key, value] of Object.entries(brand)) {
    const cssVar = BRAND_CSS_MAP[key as keyof BrandOverride];
    if (cssVar && typeof value === "string") {
      vars[cssVar] = value;
    }
  }

  return vars as CSSProperties;
}
