import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireStudio, getStudioP2PListings, getStudioP2PTrades } = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  getStudioP2PListings: vi.fn(),
  getStudioP2PTrades: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireStudio }));
vi.mock("@/lib/p2p-queries", () => ({ getStudioP2PListings, getStudioP2PTrades }));

import { GET } from "./route";

function ctx(studioId: string) {
  return { params: Promise.resolve({ id: studioId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireStudio.mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "s1" });
  getStudioP2PListings.mockResolvedValue({ listings: [], total: 0, page: 1, pageSize: 25 });
  getStudioP2PTrades.mockResolvedValue({ trades: [], total: 0, page: 1, pageSize: 25 });
});

describe("GET /api/v1/studios/:id/p2p", () => {
  it("scopes the request to the studio", async () => {
    await GET(new Request("http://x/api/v1/studios/s1/p2p"), ctx("s1"));
    expect(requireStudio).toHaveBeenCalledWith("s1");
  });

  it("returns paginated listings by default", async () => {
    getStudioP2PListings.mockResolvedValue({
      listings: [
        {
          id: "l1",
          studioId: "s1",
          itemId: "i1",
          sellerPlayerId: "p1",
          price: { amount: "2.5000000", currency: "USDT" },
          status: "ACTIVE",
          lockedAt: null,
          createdAt: "2026-06-23T12:00:00.000Z",
          itemName: "Sword",
          sellerHandle: null,
          sellerWallet: "GSELLER",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    const res = await GET(new Request("http://x/api/v1/studios/s1/p2p"), ctx("s1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(getStudioP2PListings).toHaveBeenCalledWith("s1", { status: undefined, page: 1, pageSize: 25 });
  });

  it("returns trades when tab=trades", async () => {
    getStudioP2PTrades.mockResolvedValue({
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
          escrowTxHash: "escrowhash",
          payoutTxHash: null,
          status: "ESCROW_PENDING",
          createdAt: "2026-06-23T12:00:00.000Z",
          completedAt: null,
          itemName: "Sword",
          buyerWallet: "GBUYER",
          sellerWallet: "GSELLER",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    const res = await GET(new Request("http://x/api/v1/studios/s1/p2p?tab=trades"), ctx("s1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trades).toHaveLength(1);
    expect(body.trades[0].escrowTxHash).toBe("escrowhash");
    expect(getStudioP2PTrades).toHaveBeenCalledWith("s1", { status: undefined, page: 1, pageSize: 25 });
  });

  it("filters listings by status", async () => {
    await GET(new Request("http://x/api/v1/studios/s1/p2p?status=SOLD"), ctx("s1"));
    expect(getStudioP2PListings).toHaveBeenCalledWith("s1", { status: "SOLD", page: 1, pageSize: 25 });
  });

  it("filters trades by status", async () => {
    await GET(new Request("http://x/api/v1/studios/s1/p2p?tab=trades&status=COMPLETED"), ctx("s1"));
    expect(getStudioP2PTrades).toHaveBeenCalledWith("s1", { status: "COMPLETED", page: 1, pageSize: 25 });
  });

  it("ignores invalid status values", async () => {
    await GET(new Request("http://x/api/v1/studios/s1/p2p?status=BAD"), ctx("s1"));
    expect(getStudioP2PListings).toHaveBeenCalledWith("s1", { status: undefined, page: 1, pageSize: 25 });
  });

  it("paginates using query params", async () => {
    await GET(new Request("http://x/api/v1/studios/s1/p2p?page=3&pageSize=10"), ctx("s1"));
    expect(getStudioP2PListings).toHaveBeenCalledWith("s1", { status: undefined, page: 3, pageSize: 10 });
  });
});
