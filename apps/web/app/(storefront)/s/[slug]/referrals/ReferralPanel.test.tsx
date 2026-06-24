// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ReferralPanel } from "./ReferralPanel";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/referrals") && init?.method === "POST") {
        return new Response(JSON.stringify({ code: "ABC123" }), { status: 200 });
      }
      if (String(url).endsWith("/api/v1/referrals/me")) {
        return new Response(
          JSON.stringify({ code: "ABC123", total: 3, qualified: 2, rewarded: 1, totalRewardAmount: "0.5000000", rewardCurrency: "USDT" }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReferralPanel", () => {
  it("renders the share link with the generated code and performance counts", async () => {
    render(<ReferralPanel slug="gridlock" appBaseUrl="https://app.test" />);
    await waitFor(() => expect(screen.getByText("ABC123")).toBeInTheDocument());
    expect(screen.getByText("https://app.test/s/gridlock?ref=ABC123")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument()); // qualified
  });
});
