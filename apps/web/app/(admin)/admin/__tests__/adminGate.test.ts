import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireRole, redirect } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error("REDIRECT:" + url);
  }),
}));

vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("next/navigation", () => ({ redirect }));

import AdminLayout from "../layout";

describe("admin layout gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /login when the principal is not an admin", async () => {
    requireRole.mockRejectedValueOnce(new Error("forbidden"));
    await expect(AdminLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("renders children for an admin principal", async () => {
    requireRole.mockResolvedValueOnce({ kind: "user", role: "ADMIN", userId: "u1" });
    const out = await AdminLayout({ children: "OK" });
    expect(out).toBeTruthy();
  });
});
