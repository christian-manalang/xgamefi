// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { PurchaseHistoryPanel } from "./PurchaseHistoryPanel";

const baseOrder = {
  id: "order-1",
  studioId: "stu1",
  itemId: "i1",
  playerId: "p1",
  quantity: 2,
  currency: "USDT" as const,
  grossAmount: "20.0000000",
  discountAmount: "0.0000000",
  platformFeeAmount: "1.0000000",
  netToStudioAmount: "19.0000000",
  promotionId: null,
  referralCodeUsed: null,
  paymentStatus: "PAID" as const,
  deliveryStatus: "DELIVERED" as const,
  stellarTxHash: "txhash123",
  paidAt: "2026-07-01T12:00:00.000Z",
  deliveredAt: "2026-07-01T12:05:00.000Z",
  createdAt: "2026-07-01T12:00:00.000Z",
  item: { id: "i1", name: "Sword Skin", imageUrl: null },
};

function mockFetch(response: (url: string) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response(url))));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PurchaseHistoryPanel", () => {
  it("renders purchase list with item, amount, status, tx hash and date", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ orders: [baseOrder], total: 1 }), { status: 200 }),
    );

    render(<PurchaseHistoryPanel slug="gridlock" />);

    await waitFor(() => expect(screen.getByTestId("purchase-list")).toBeInTheDocument());

    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText("20.0000000 USDT")).toBeInTheDocument();
    expect(screen.getByText("PAID / DELIVERED")).toBeInTheDocument();
    expect(screen.getByText("txhash123")).toHaveAttribute("href", "https://stellar.expert/explorer/testnet/tx/txhash123");
    expect(screen.getByTestId("purchase-date")).toHaveTextContent(/7\/1\/2026/);
  });

  it("shows an empty state when the player has no purchases", async () => {
    mockFetch(() => new Response(JSON.stringify({ orders: [], total: 0 }), { status: 200 }));

    render(<PurchaseHistoryPanel slug="gridlock" />);

    await waitFor(() => expect(screen.getByText("No purchases yet.")).toBeInTheDocument());
    expect(screen.queryByTestId("purchase-list")).not.toBeInTheDocument();
  });

  it("prompts to connect the wallet on 401", async () => {
    mockFetch(() => new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }));

    render(<PurchaseHistoryPanel slug="gridlock" />);

    await waitFor(() =>
      expect(screen.getByTestId("purchase-error")).toHaveTextContent(
        "Connect your wallet to view purchases.",
      ),
    );
  });

  it("paginates through orders", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("page=2")) {
        return Promise.resolve(new Response(JSON.stringify({ orders: [{ ...baseOrder, id: "order-2", item: { ...baseOrder.item, name: "Shield Skin" } }], total: 21 }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ orders: Array(20).fill(null).map((_, i) => ({ ...baseOrder, id: `order-${i}` })), total: 21 }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PurchaseHistoryPanel slug="gridlock" />);

    await waitFor(() => expect(screen.getByText("PAGE 1 / 2")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next →"));

    await waitFor(() => expect(screen.getByText("Shield Skin")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/v1/shops/gridlock/orders/me?page=2&pageSize=20"),
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
