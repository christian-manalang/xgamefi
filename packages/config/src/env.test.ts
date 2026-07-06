import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const valid = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(32),
  DATABASE_URL: "postgresql://user:pass@localhost:5432/xgamefi",
  SHADOW_DATABASE_URL: "postgresql://user:pass@localhost:5432/xgamefi_shadow",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "xgamefi",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "change-me-strong",
  STELLAR_NETWORK: "testnet",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  STELLAR_RECEIVING_ACCOUNT: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  STELLAR_PAYOUT_SIGNER_SECRET: "SAEXAMPLE",
  STELLAR_USD_ASSET_CODE: "USDT",
  STELLAR_USD_ASSET_ISSUER: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  PLATFORM_FEE_BPS: "500",
  WEBHOOK_MAX_ATTEMPTS: "5",
  WEBHOOK_TIMESTAMP_TOLERANCE_SEC: "300",
};

describe("parseEnv", () => {
  it("parses a valid env and coerces numbers/booleans", () => {
    const e = parseEnv(valid);
    expect(e.PLATFORM_FEE_BPS).toBe(500);
    expect(e.WEBHOOK_MAX_ATTEMPTS).toBe(5);
    expect(e.S3_FORCE_PATH_STYLE).toBe(true);
    expect(e.STELLAR_NETWORK).toBe("testnet");
  });

  it("throws on a missing required var", () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when SESSION_SECRET is shorter than 32 chars", () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "tooshort" })).toThrow(/SESSION_SECRET/);
  });

  it("throws on an invalid STELLAR_NETWORK enum value", () => {
    expect(() => parseEnv({ ...valid, STELLAR_NETWORK: "mainnet" })).toThrow(/STELLAR_NETWORK/);
  });

  it("allows SHADOW_DATABASE_URL to be omitted", () => {
    const { SHADOW_DATABASE_URL, ...withoutShadow } = valid;
    expect(() => parseEnv(withoutShadow)).not.toThrow();
  });
});
