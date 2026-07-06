import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST, resetMockItems } from "./route";

describe("/api/mock-game/items", () => {
  beforeEach(() => {
    resetMockItems();
  });

  it("GET returns the default mock items", async () => {
    const res = await GET();
    const json = await res.json();
    expect(json).toHaveLength(6);
    expect(json[0]).toMatchObject({ externalId: "sword_skin_01", name: "Sword Skin" });
  });

  it("POST adds a single item and returns 201", async () => {
    const body = {
      externalId: "axe-001",
      name: "Battle Axe",
      description: "A heavy axe.",
      imageUrl: "https://picsum.photos/seed/axe/400/400",
      price: "12.50",
      currency: "XLM",
      stock: 10,
      metadata: { rarity: "EPIC", category: "weapon" },
    };
    const res = await POST(new Request("http://localhost:3000/api/mock-game/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    expect(res.status).toBe(201);

    const getRes = await GET();
    const items = await getRes.json();
    expect(items).toHaveLength(7);
    expect(items.find((i: unknown) => (i as { externalId: string }).externalId === "axe-001")).toMatchObject(body);
  });

  it("POST accepts an array of items", async () => {
    const body = [
      { externalId: "bow-001", name: "Longbow", price: "7.00", currency: "USDT" },
      { externalId: "arrow-001", name: "Quiver of Arrows", price: "0.50", currency: "XLM", stock: 100 },
    ];
    const res = await POST(new Request("http://localhost:3000/api/mock-game/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    expect(res.status).toBe(201);

    const getRes = await GET();
    const items = await getRes.json();
    expect(items).toHaveLength(8);
  });

  it("POST upserts existing items by externalId", async () => {
    const body = { externalId: "sword_skin_01", name: "100 Gems", price: "9.99", currency: "USDT" };
    await POST(new Request("http://localhost:3000/api/mock-game/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    const getRes = await GET();
    const items = await getRes.json();
    expect(items).toHaveLength(6);
    const updated = items.find((i: unknown) => (i as { externalId: string }).externalId === "sword_skin_01");
    expect(updated).toMatchObject({ name: "100 Gems", price: "9.99", currency: "USDT" });
  });

  it("POST returns 400 for invalid payload", async () => {
    const res = await POST(new Request("http://localhost:3000/api/mock-game/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: "", name: "", price: "free", currency: "BTC" }),
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
