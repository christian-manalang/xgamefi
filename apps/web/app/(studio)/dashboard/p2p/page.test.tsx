import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  requireStudio: vi.fn(),
  getStudioP2PListings: vi.fn(),
  getStudioP2PTrades: vi.fn(),
}));

vi.mock("../../../../lib/auth/guards", () => ({
  requirePrincipal: mocks.requirePrincipal,
  requireStudio: mocks.requireStudio,
}));
vi.mock("../../../../lib/p2p-queries", () => ({
  getStudioP2PListings: mocks.getStudioP2PListings,
  getStudioP2PTrades: mocks.getStudioP2PTrades,
}));

import Page from "./page";

beforeEach(() => {
  cleanup();
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.getStudioP2PListings.mockReset().mockResolvedValue({
    listings: [
      {
        id: "l1",
        studioId: "stu1",
        itemId: "i1",
        sellerPlayerId: "p1",
        price: { amount: "2.5000000", currency: "USDT" },
        status: "ACTIVE",
        lockedAt: null,
        createdAt: "2026-06-23T12:00:00.000Z",
        itemName: "Sword Skin",
        sellerHandle: "seller_handle",
        sellerWallet: "GSELLER",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
  });
  mocks.getStudioP2PTrades.mockReset().mockResolvedValue({
    trades: [
      {
        id: "t1",
        listingId: "l1",
        buyerPlayerId: "p2",
        sellerPlayerId: "p1",
        price: "2.5000000",
        currency: "USDT",
        platformFeeAmount: "0.1250000",
        netToSellerAmount: "2.3750000",
        escrowTxHash: "escrowhash123456",
        payoutTxHash: "payouthash654321",
        status: "COMPLETED",
        createdAt: "2026-06-23T12:00:00.000Z",
        completedAt: "2026-06-23T12:05:00.000Z",
        itemName: "Sword Skin",
        buyerWallet: "GBUYER",
        sellerWallet: "GSELLER",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
  });
});

// @vitest-environment jsdom
describe("/dashboard/p2p", () => {
  it("renders listings with item, seller, price and status", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/seller_handle/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.5000000 USDT/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Listing status")).toHaveTextContent("ACTIVE");
  });

  it("scopes queries to the studio", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(mocks.requireStudio).toHaveBeenCalledWith("stu1");
    expect(mocks.getStudioP2PListings).toHaveBeenCalledWith("stu1", { status: undefined, page: 1, pageSize: 25 });
  });

  it("renders trades with buyer/seller, fee, status and tx hashes", async () => {
    render(await Page({ searchParams: Promise.resolve({ tab: "trades" }) }));
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/GBUYER/i)).toBeInTheDocument();
    expect(screen.getByText(/GSELLER/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.1250000 USDT/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Trade status")).toHaveTextContent("COMPLETED");
    expect(screen.getByText(/escrow…123456/)).toBeInTheDocument();
    expect(screen.getByText(/payout…654321/)).toBeInTheDocument();
  });

  it("passes status filter to queries", async () => {
    render(await Page({ searchParams: Promise.resolve({ status: "SOLD" }) }));
    expect(mocks.getStudioP2PListings).toHaveBeenCalledWith("stu1", { status: "SOLD", page: 1, pageSize: 25 });
  });

  it("shows no-studio-context message when the principal has no studio", async () => {
    mocks.requirePrincipal.mockResolvedValueOnce({ kind: "user", role: "ADMIN", studioId: undefined });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/no studio context/i)).toBeInTheDocument();
  });
});
