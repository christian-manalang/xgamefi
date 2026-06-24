"use client";

import type { ShopDto } from "@xgamefi/shared";
import type { ItemDto } from "@xgamefi/shared/dto";

export function ShopBuilder({ shop, items }: { shop: ShopDto; items: ItemDto[] }) {
  return (
    <div data-testid="builder">{shop.slug}:{items.length}</div>
  );
}
