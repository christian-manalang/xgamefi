import { NextResponse } from "next/server";
import { RemoteItem, RemoteItemsSchema } from "@xgamefi/shared/zod/catalogue";

const MOCK_ITEMS: RemoteItem[] = [
  {
    externalId: "sword_skin_01",
    name: "Sword Skin",
    description: "The demo Sword Skin — acid-lime rim light.",
    imageUrl: "https://picsum.photos/seed/swordskin/400/400",
    price: "1.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "LEGENDARY", category: "skin" },
  },
  {
    externalId: "phase_core_02",
    name: "Phase Core",
    description: "Overclocked phase core.",
    imageUrl: "https://picsum.photos/seed/phasecore/400/400",
    price: "5.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "EPIC", category: "core" },
  },
  {
    externalId: "neon_blade_03",
    name: "Neon Blade",
    description: "Cyan-edge neon blade.",
    imageUrl: "https://picsum.photos/seed/neonblade/400/400",
    price: "3.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "RARE", category: "blade" },
  },
  {
    externalId: "obsidian_hull_04",
    name: "Obsidian Hull",
    description: "Matte obsidian hull plating.",
    imageUrl: "https://picsum.photos/seed/obsidianhull/400/400",
    price: "12.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "LEGENDARY", category: "armor" },
  },
];

let mockItems = [...MOCK_ITEMS];

export function resetMockItems(): void {
  mockItems = [...MOCK_ITEMS];
}

export async function GET() {
  return NextResponse.json(mockItems);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = RemoteItemsSchema.safeParse(Array.isArray(body) ? body : [body]);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const incoming = parsed.data;
  for (const item of incoming) {
    const index = mockItems.findIndex((i) => i.externalId === item.externalId);
    if (index >= 0) {
      mockItems[index] = item;
    } else {
      mockItems.push(item);
    }
  }

  return NextResponse.json({ created: incoming.map((i) => i.externalId) }, { status: 201 });
}
