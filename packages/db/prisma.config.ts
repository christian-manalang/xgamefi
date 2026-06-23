import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import { resolve } from "node:path";

// Prisma 7 does not auto-load env — load the monorepo-root .env ourselves.
// (CI sets DATABASE_URL/SHADOW_DATABASE_URL directly in the job env.)
config({ path: resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: { seed: "tsx prisma/seed.ts" },
});
