// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PromotionsManager } from "./PromotionsManager";

const initial = [
  {
    id: "p1",
    name: "Launch",
    type: "PERCENT",
    value: "10.0000000",
    currency: null,
    appliesToItemIds: [],
    bundleConfig: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    isActive: true,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ promotion: { ...initial[0], id: "p2", name: "Summer", value: "20.0000000" } }), { status: 201 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PromotionsManager", () => {
  it("lists existing promotions and shows their type + value", async () => {
    render(<PromotionsManager studioId="s1" initial={initial} />);
    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByText("PERCENT", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/10\.0000000/)).toBeInTheDocument();
  });

  it("creates a promotion via the API and appends it to the list", async () => {
    render(<PromotionsManager studioId="s1" initial={initial} />);
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Summer" } });
    fireEvent.change(screen.getByLabelText("value"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /create promotion/i }));
    await waitFor(() => expect(screen.getByText("Summer")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/v1/studios/s1/promotions", expect.objectContaining({ method: "POST" }));
  });
});
