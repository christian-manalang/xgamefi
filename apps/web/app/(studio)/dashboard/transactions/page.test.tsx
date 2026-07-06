import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  listStudioOrders: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: mocks.requirePrincipal,
}));
vi.mock("@/lib/order-queries", () => ({
  listStudioOrders: mocks.listStudioOrders,
}));

import Page from "./page";

// @vitest-environment jsdom

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.listStudioOrders.mockReset().mockResolvedValue({
    data: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        studioId: "stu1",
        itemId: "i1",
        playerId: "p1",
        quantity: 1,
        currency: "USDT",
        grossAmount: "5.0000000",
        discountAmount: "0.0000000",
        platformFeeAmount: "0.2500000",
        netToStudioAmount: "4.7500000",
        promotionId: null,
        referralCodeUsed: null,
        paymentStatus: "PAID",
        deliveryStatus: "DELIVERED",
        stellarTxHash: "abc123",
        paidAt: "2026-06-23T12:00:00.000Z",
        deliveredAt: "2026-06-23T12:01:00.000Z",
        createdAt: "2026-06-23T11:59:00.000Z",
        playerWallet: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH2",
        itemName: "Energy Core",
      },
    ],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
});

describe("/dashboard/transactions", () => {
  it("renders the page title and transaction rows", async () => {
    render(await Page());
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Energy Core")).toBeInTheDocument();
    expect(screen.getByText(/5\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("PAID / DELIVERED")).toBeInTheDocument();
  });

  it("links the stellar tx hash to the explorer", async () => {
    render(await Page());
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "https://stellar.expert/explorer/testnet/tx/abc123");
    expect(links[0]).toHaveAttribute("target", "_blank");
  });

  it("queries orders scoped to the logged-in studio", async () => {
    render(await Page());
    expect(mocks.listStudioOrders).toHaveBeenCalledWith(expect.objectContaining({ studioId: "stu1", limit: 50 }));
  });
});
