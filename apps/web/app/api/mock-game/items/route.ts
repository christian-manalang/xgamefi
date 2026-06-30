import { NextResponse } from "next/server";

const MOCK_ITEMS = [
  {
    externalId: "gem-001",
    name: "10 Gems",
    description: "A pack of 10 gems for in-game currency.",
    imageUrl: "https://picsum.photos/seed/gem/400/400",
    price: "1.00",
    currency: "XLM",
    stock: 999,
    metadata: { category: "currency" },
  },
  {
    externalId: "sword-001",
    name: "Iron Sword",
    description: "A basic iron sword for close combat.",
    imageUrl: "https://picsum.photos/seed/sword/400/400",
    price: "5.00",
    currency: "XLM",
    stock: 50,
    metadata: { rarity: "common", category: "weapon" },
  },
  {
    externalId: "shield-001",
    name: "Wooden Shield",
    description: "A basic shield for defensive combat.",
    imageUrl: "https://picsum.photos/seed/shield/400/400",
    price: "3.00",
    currency: "XLM",
    stock: 100,
    metadata: { rarity: "common", category: "armor" },
  },
  {
    externalId: "potion-001",
    name: "Health Potion",
    description: "Restores 50 HP when consumed.",
    imageUrl: "https://picsum.photos/seed/potion/400/400",
    price: "2.00",
    currency: "XLM",
    stock: 200,
    metadata: { rarity: "common", category: "consumable" },
  },
];

export async function GET() {
  return NextResponse.json(MOCK_ITEMS);
}
