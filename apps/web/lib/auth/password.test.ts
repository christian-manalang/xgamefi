import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing (argon2id)", () => {
  it("produces an argon2id hash that verifies", async () => {
    const hash = await hashPassword("s3cret");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "s3cret")).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
  it("returns false (never throws) on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});
