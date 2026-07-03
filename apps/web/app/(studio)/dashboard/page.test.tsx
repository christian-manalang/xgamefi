import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  requireStudio: vi.fn(),
  computeStudioMetrics: vi.fn(),
  toStudioMetricsDto: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../../../lib/auth/guards", () => ({
  requirePrincipal: mocks.requirePrincipal,
  requireStudio: mocks.requireStudio,
}));
vi.mock("@xgamefi/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/shared")>();
  return {
    ...actual,
    computeStudioMetrics: mocks.computeStudioMetrics,
    toStudioMetricsDto: mocks.toStudioMetricsDto,
  };
});
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { studio: { findUnique: mocks.findUnique } } };
});

import Page from "./page";

beforeEach(() => {
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.findUnique.mockReset().mockResolvedValue({ id: "stu1", name: "Neon Studio", slug: "neon-studio" });
  mocks.computeStudioMetrics.mockReset().mockResolvedValue({
    gmv: { toString: () => "10", toFixed: () => "10.0000000" },
    feesCollected: { toString: () => "0.5", toFixed: () => "0.5000000" },
    orderCount: 3,
    recentOrders: [],
    webhookHealth: { total: 4, delivered: 3, failed: 1, successRate: 75 },
  });
  mocks.toStudioMetricsDto.mockReset().mockReturnValue({
    gmv: "10.0000000",
    feesCollected: "0.5000000",
    orderCount: 3,
    recentOrders: [
      {
        id: "order-id-1",
        studioId: "stu1",
        itemName: "Sword Skin",
        grossAmount: "5.0000000",
        currency: "USDT",
        paymentStatus: "PAID",
        deliveryStatus: "DELIVERED",
        createdAt: "2026-07-03T00:00:00.000Z",
      },
    ],
    webhookHealth: { total: 4, delivered: 3, failed: 1, successRate: 75 },
  });
});

// @vitest-environment jsdom
afterEach(cleanup);

describe("/dashboard", () => {
  it("renders studio name and scoped metrics", async () => {
    render(await Page());
    expect(screen.getByText("Neon Studio")).toBeInTheDocument();
    expect(screen.getByText("10.0000000")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("0.5000000")).toBeInTheDocument();
    expect(screen.getByText("75% DELIVERY")).toBeInTheDocument();
  });

  it("renders recent orders", async () => {
    render(await Page());
    expect(screen.getAllByText(/Sword Skin/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/PAID/).length).toBeGreaterThanOrEqual(1);
  });

  it("calls metrics for the logged-in studio", async () => {
    await Page();
    expect(mocks.requireStudio).toHaveBeenCalledWith("stu1");
    expect(mocks.computeStudioMetrics).toHaveBeenCalledWith("stu1");
  });
});
