// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerMocks.push }),
}));

import { SellClient } from "./sell-client";

const items = [
  { itemId: "i1", name: "Sword Skin", imageUrl: null, rarity: "LEGENDARY", category: "skins", quantity: 3 },
  { itemId: "i2", name: "Blade Core", imageUrl: null, rarity: "EPIC", category: "cores", quantity: 1 },
];

function mockFetch(responses: Record<string, () => Promise<Response>>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const handler = responses[url];
    if (handler) return handler();
    return Promise.resolve(new Response(JSON.stringify({ error: "NOT_MOCKED" }), { status: 500 }));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SellClient", () => {
  beforeEach(() => {
    routerMocks.push.mockReset();
  });

  it("shows wallet-required state", () => {
    render(<SellClient slug="gridlock" initialItems={[]} isPlayer={false} />);
    expect(screen.getByText(/wallet required/i)).toBeInTheDocument();
  });

  it("shows empty state when no items are owned", () => {
    render(<SellClient slug="gridlock" initialItems={[]} isPlayer={true} />);
    expect(screen.getByText(/no items available/i)).toBeInTheDocument();
  });

  it("selects an item, enters price, and creates a listing", async () => {
    const fetchMock = mockFetch({
      "/api/v1/p2p/listings": async () =>
        new Response(JSON.stringify({ listing: { id: "l1", price: { amount: "2.5000000", currency: "USDT" }, status: "ACTIVE" } }), { status: 201 }),
    });

    render(<SellClient slug="gridlock" initialItems={items} isPlayer={true} />);

    fireEvent.click(screen.getByText("Blade Core"));
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: /create listing/i }));

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/s/gridlock/market/listing/l1"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/p2p/listings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ itemId: "i2", price: "2.5", currency: "USDT" }),
      }),
    );
  });

  it("displays an error when listing creation fails", async () => {
    mockFetch({
      "/api/v1/p2p/listings": async () =>
        new Response(JSON.stringify({ error: "invalid input" }), { status: 400 }),
    });

    render(<SellClient slug="gridlock" initialItems={items} isPlayer={true} />);

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: /create listing/i }));

    await waitFor(() => expect(screen.getByText(/invalid input/i)).toBeInTheDocument());
  });
});
