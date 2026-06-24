"use client";

import type { ShopLayout, ShopTheme } from "@xgamefi/shared";
import type { ItemDto } from "@xgamefi/shared/dto";
import { StorefrontGrid } from "../../../../(storefront)/s/[slug]/StorefrontGrid";

export function StorefrontPreview({
  layout,
  theme,
  featuredItemIds,
  items,
}: {
  layout: ShopLayout;
  theme: ShopTheme;
  featuredItemIds: string[];
  items: ItemDto[];
}) {
  return (
    <div className="border-2 border-outline-variant bg-surface-container-lowest p-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-outline">LIVE_PREVIEW · PLAYER_VIEW</p>
      <StorefrontGrid layout={layout} theme={theme} featuredItemIds={featuredItemIds} items={items} slug="preview" />
    </div>
  );
}
