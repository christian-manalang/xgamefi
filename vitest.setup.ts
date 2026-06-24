// Loads environment variables before any test module evaluates its top-level
// `env` (parsed fail-fast at import). Prefers a local `.env` (CI copies
// `.env.test` → `.env`); falls back to `.env.test` so `pnpm test` works standalone.
import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const envFile = existsSync(resolve(root, ".env")) ? ".env" : ".env.test";
config({ path: resolve(root, envFile) });
