import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, apiKeyPrefix, verifyApiKey } from "../apikey";
import { toApiKeyDto } from "../dto/studioKey";

describe("api keys", () => {
  it("generates a prefixed raw key with matching prefix and hash", () => {
    const { raw, prefix, hashedKey } = generateApiKey();
    expect(raw.startsWith("xgk_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hashedKey).toBe(hashApiKey(raw));
    expect(prefix).toBe(apiKeyPrefix(raw));
  });

  it("verifies a key by hash (constant-time) and rejects a wrong key", () => {
    const { raw, hashedKey } = generateApiKey();
    expect(verifyApiKey(raw, hashedKey)).toBe(true);
    expect(verifyApiKey(raw + "x", hashedKey)).toBe(false);
    expect(verifyApiKey("xgk_wrong", hashedKey)).toBe(false);
  });

  it("the DTO never leaks the raw key or hashedKey", () => {
    const dto = toApiKeyDto({
      id: "k1",
      keyPrefix: "xgk_abcd1234",
      scopes: ["ingest"],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(0),
    });
    expect(JSON.stringify(dto)).not.toContain("deadbeef");
    expect((dto as Record<string, unknown>).hashedKey).toBeUndefined();
    expect(dto.keyPrefix).toBe("xgk_abcd1234");
  });
});
