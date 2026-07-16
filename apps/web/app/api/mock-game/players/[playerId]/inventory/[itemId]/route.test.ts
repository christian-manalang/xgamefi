import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("/api/mock-game/players/:playerId/inventory/:itemId", () => {
  it("GET returns quantity 1 so any seeded item is listable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ quantity: 1 });
  });
});
