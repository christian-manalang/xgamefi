import { NextResponse } from "next/server";
import { RemoteItem, RemoteItemsSchema } from "@xgamefi/shared/zod/catalogue";

function generatedImage(prompt: string, seed: number): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=400&height=400&seed=${seed}&nologo=true`;
}

const MOCK_ITEMS: RemoteItem[] = [
  {
    externalId: "sword_skin_01",
    name: "Sword Skin",
    description: "Acid-lime rim light pulses along the edge of this legendary blade.",
    imageUrl: generatedImage(
      "cyberpunk neon sword game item icon, glowing acid green edge, black background, detailed sci-fi digital art, centered",
      101,
    ),
    price: "1.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "LEGENDARY", category: "skin" },
  },
  {
    externalId: "phase_core_02",
    name: "Phase Core",
    description: "Overclocked phase core humming with unstable violet energy.",
    imageUrl: generatedImage(
      "glowing phase core crystal game item icon, purple energy pulsing inside, black background, sci-fi digital art, centered",
      202,
    ),
    price: "5.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "EPIC", category: "core" },
  },
  {
    externalId: "neon_blade_03",
    name: "Neon Blade",
    description: "Cyan-edge mono-filament blade that cuts through shielding.",
    imageUrl: generatedImage(
      "neon cyan katana blade game item icon, electric energy, cyberpunk style, black background, detailed, centered",
      303,
    ),
    price: "3.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "RARE", category: "blade" },
  },
  {
    externalId: "obsidian_hull_04",
    name: "Obsidian Hull",
    description: "Matte obsidian hull plating with crimson micro-channel cooling.",
    imageUrl: generatedImage(
      "obsidian armor plating game item icon, matte black with red glowing accents, black background, sci-fi digital art, centered",
      404,
    ),
    price: "12.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "LEGENDARY", category: "armor" },
  },
  {
    externalId: "plasma_rifle_05",
    name: "Plasma Rifle",
    description: "Compact rifle that vents superheated plasma with each shot.",
    imageUrl: generatedImage(
      "plasma rifle game item icon, blue energy glow, futuristic weapon, black background, detailed sci-fi digital art, centered",
      505,
    ),
    price: "8.00",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "EPIC", category: "weapon" },
  },
  {
    externalId: "quantum_visor_06",
    name: "Quantum Visor",
    description: "HUD visor that highlights weak points across multiple spectrums.",
    imageUrl: generatedImage(
      "quantum visor helmet game item icon, holographic blue lens, futuristic sci-fi digital art, black background, centered",
      606,
    ),
    price: "4.50",
    currency: "USDT",
    stock: null,
    metadata: { rarity: "RARE", category: "gear" },
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
