import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requireStudio: vi.fn(),
  requirePrincipal: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../../../../lib/auth/guards", () => ({
  requireStudio: mocks.requireStudio,
  requirePrincipal: mocks.requirePrincipal,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return { ...actual, prisma: { item: { findMany: mocks.findMany } } };
});

import Page from "./page";

beforeEach(() => {
  mocks.requireStudio.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.requirePrincipal.mockReset().mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.findMany.mockReset().mockResolvedValue([{
    id: "i1", studioId: "stu1", externalId: "sword_skin_01", name: "Sword Skin",
    description: "blade", imageUrl: null, priceAmount: { toString: () => "1", toFixed: () => "1.0000000" },
    priceCurrency: "USDT", stock: null, rarity: "LEGENDARY", category: "skins",
    metadata: {}, isActive: true, syncedAt: null,
  }]);
});

// @vitest-environment jsdom
describe("/dashboard/items", () => {
  it("renders synced items with name, externalId and price", async () => {
    render(await Page());
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/sword_skin_01/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("LEGENDARY")).toBeInTheDocument();
  });
});
