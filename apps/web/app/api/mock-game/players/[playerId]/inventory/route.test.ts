import { describe, it, expect } from "vitest";
import { POST } from "./route";

describe("/api/mock-game/players/:playerId/inventory", () => {
  it("POST acknowledges the settlement item transfer with 200", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/mock-game/players/p1/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPlayerId: "p0", itemId: "sword_skin_01", quantity: 1, tradeId: "t1" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
