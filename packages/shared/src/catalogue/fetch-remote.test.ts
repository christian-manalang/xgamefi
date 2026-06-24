import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("../ssrf", () => ({ safeFetch }));

import { fetchRemoteItems } from "./fetch-remote";

beforeEach(() => safeFetch.mockReset());

describe("fetchRemoteItems", () => {
  it("fetches {apiBaseUrl}/items through safeFetch and validates", async () => {
    safeFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { externalId: "sword_skin_01", name: "Sword Skin", price: "1.0000000", currency: "USDT" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const items = await fetchRemoteItems("https://api.gridlock.gg");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://api.gridlock.gg/items",
      expect.objectContaining({ maxBytes: 1_000_000, timeoutMs: 10_000 }),
    );
    expect(items).toHaveLength(1);
    const first = items[0];
    expect(first).toBeDefined();
    expect(first!.externalId).toBe("sword_skin_01");
  });

  it("throws on non-2xx", async () => {
    safeFetch.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchRemoteItems("https://api.gridlock.gg")).rejects.toThrow(/500/);
  });

  it("throws on schema-invalid payload", async () => {
    safeFetch.mockResolvedValue(
      new Response(JSON.stringify([{ externalId: "x" }]), { status: 200 }),
    );
    await expect(fetchRemoteItems("https://api.gridlock.gg")).rejects.toThrow();
  });
});
