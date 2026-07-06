import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getPrincipal: vi.fn(),
  requireStudio: vi.fn(),
  studioFindUnique: vi.fn(),
  apiKeyFindMany: vi.fn(),
  deliveryFindMany: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error("REDIRECT:" + url);
  }),
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: mocks.getPrincipal,
  requireStudio: mocks.requireStudio,
}));
vi.mock("@xgamefi/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xgamefi/db")>();
  return {
    ...actual,
    prisma: {
      studio: { findUnique: mocks.studioFindUnique },
      apiKey: { findMany: mocks.apiKeyFindMany },
      webhookDelivery: { findMany: mocks.deliveryFindMany },
    },
  };
});
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import Page from "../page";

const baseStudio = {
  id: "stu1",
  name: "Gridlock Games",
  slug: "gridlock",
  description: "test studio",
  logoUrl: "https://example.com/logo.png",
  brand: { primary: "#c3f400", accent: "#ffabf3" },
  status: "ACTIVE",
  platformFeeBps: 500,
  payoutWalletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  integrationMode: "API_PULL",
  webhookUrl: "https://example.com/webhook",
  apiBaseUrl: "https://example.com/api",
  createdAt: new Date(0),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPrincipal.mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.requireStudio.mockResolvedValue({ kind: "user", role: "STUDIO_OWNER", studioId: "stu1" });
  mocks.studioFindUnique.mockResolvedValue(baseStudio);
  mocks.apiKeyFindMany.mockResolvedValue([]);
  mocks.deliveryFindMany.mockResolvedValue([]);
});

// @vitest-environment jsdom
describe("/dashboard/settings", () => {
  it("redirects to /login when the user has no studio", async () => {
    mocks.getPrincipal.mockResolvedValueOnce({ kind: "user", role: "ADMIN" });
    await expect(Page()).rejects.toThrow("REDIRECT:/login");
  });

  it("enforces requireStudio RBAC", async () => {
    mocks.requireStudio.mockRejectedValueOnce(new Error("forbidden"));
    await expect(Page()).rejects.toThrow("forbidden");
  });

  it("redirects to /login when the studio is missing", async () => {
    mocks.studioFindUnique.mockResolvedValueOnce(null);
    await expect(Page()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders the settings client with studio data", async () => {
    render(await Page());
    expect(screen.getByText("Studio Settings")).toBeInTheDocument();
    expect(screen.getByText("gridlock")).toBeInTheDocument();
  });

  it("queries the correct studio scope", async () => {
    await Page();
    expect(mocks.requireStudio).toHaveBeenCalledWith("stu1");
    expect(mocks.studioFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "stu1" } }));
    expect(mocks.apiKeyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studioId: "stu1" } }),
    );
  });
});
