import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { prisma, Prisma } from "../src/index.js";
import { env } from "@xgamefi/config/env";

const GRIDLOCK_BRAND = {
  primary: "#c3f400",
  secondary: "#fe00fe",
  background: "#131313",
  logo: null,
};
// Testnet payout wallet (demo placeholder; rotate before pubnet).
const GRIDLOCK_PAYOUT_WALLET = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const FILLER_ITEMS = [
  { externalId: "phase_core_02", name: "Phase Core", rarity: "EPIC", category: "core", price: "5", description: "Overclocked phase core." },
  { externalId: "neon_blade_03", name: "Neon Blade", rarity: "RARE", category: "blade", price: "3", description: "Cyan-edge neon blade." },
  { externalId: "obsidian_hull_04", name: "Obsidian Hull", rarity: "LEGENDARY", category: "armor", price: "12", description: "Matte obsidian hull plating." },
];

async function main() {
  const passwordHash = await argon2.hash(env.ADMIN_PASSWORD, { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { username: env.ADMIN_USERNAME },
    update: { passwordHash, role: "ADMIN", isActive: true },
    create: { username: env.ADMIN_USERNAME, passwordHash, role: "ADMIN", isActive: true },
  });

  // Webhook secret is generated once; only its hash is stored (secret shown to studio out-of-band).
  const webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
  const webhookSecretHash = await argon2.hash(webhookSecret, { type: argon2.argon2id });

  const studio = await prisma.studio.upsert({
    where: { slug: "gridlock" },
    update: {
      name: "Gridlock Games",
      brand: GRIDLOCK_BRAND,
      payoutWalletAddress: GRIDLOCK_PAYOUT_WALLET,
      webhookUrl: "http://localhost:3000/api/health",
      status: "ACTIVE",
      platformFeeBps: env.PLATFORM_FEE_BPS,
      integrationMode: "WEBHOOK_PUSH",
    },
    create: {
      name: "Gridlock Games",
      slug: "gridlock",
      description: "Anchor partner — Neon Overdrive gear.",
      brand: GRIDLOCK_BRAND,
      payoutWalletAddress: GRIDLOCK_PAYOUT_WALLET,
      webhookUrl: "http://localhost:3000/api/health",
      webhookSecretHash,
      status: "ACTIVE",
      platformFeeBps: env.PLATFORM_FEE_BPS,
      integrationMode: "WEBHOOK_PUSH",
    },
  });

  const swordSkin = await prisma.item.upsert({
    where: { studioId_externalId: { studioId: studio.id, externalId: "sword_skin_01" } },
    update: {
      name: "Sword Skin",
      priceAmount: new Prisma.Decimal("1"),
      priceCurrency: "USDT",
      isActive: true,
    },
    create: {
      studioId: studio.id,
      externalId: "sword_skin_01",
      name: "Sword Skin",
      description: "The demo Sword Skin — acid-lime rim light.",
      priceAmount: new Prisma.Decimal("1"),
      priceCurrency: "USDT",
      rarity: "LEGENDARY",
      category: "skin",
      stock: null,
      isActive: true,
      syncedAt: new Date(),
    },
  });

  for (const f of FILLER_ITEMS) {
    await prisma.item.upsert({
      where: { studioId_externalId: { studioId: studio.id, externalId: f.externalId } },
      update: {},
      create: {
        studioId: studio.id,
        externalId: f.externalId,
        name: f.name,
        description: f.description,
        priceAmount: new Prisma.Decimal(f.price),
        priceCurrency: "USDT",
        rarity: f.rarity,
        category: f.category,
        stock: null,
        isActive: true,
        syncedAt: new Date(),
      },
    });
  }

  await prisma.shop.upsert({
    where: { studioId: studio.id },
    update: { status: "PUBLISHED", featuredItemIds: [swordSkin.id], publishedAt: new Date() },
    create: {
      studioId: studio.id,
      status: "PUBLISHED",
      layout: { mode: "grid", sections: [{ title: "FEATURED", itemIds: [swordSkin.id] }] },
      theme: GRIDLOCK_BRAND,
      featuredItemIds: [swordSkin.id],
      publishedAt: new Date(),
    },
  });

  console.log(
    `Seed complete: admin=${admin.username} studio=${studio.slug} swordSkin=${swordSkin.id} (${FILLER_ITEMS.length} filler items)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
