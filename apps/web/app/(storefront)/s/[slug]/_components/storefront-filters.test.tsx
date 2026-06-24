// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { StorefrontFilters } from "./storefront-filters";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/s/gridlock",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

describe("StorefrontFilters", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.searchParams = new URLSearchParams();
  });

  it("updates the search query on input", () => {
    render(<StorefrontFilters categories={["skins"]} rarities={["LEGENDARY"]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sword" } });
    expect(mocks.replace).toHaveBeenCalledWith("/s/gridlock?q=sword", { scroll: false });
  });

  it("updates category and resets page", () => {
    mocks.searchParams = new URLSearchParams("page=2");
    render(<StorefrontFilters categories={["skins"]} rarities={["LEGENDARY"]} />);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "skins" } });
    expect(mocks.replace).toHaveBeenCalledWith("/s/gridlock?category=skins", { scroll: false });
  });

  it("toggles featured filter", () => {
    render(<StorefrontFilters categories={[]} rarities={[]} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(mocks.replace).toHaveBeenCalledWith("/s/gridlock?featured=1", { scroll: false });
  });
});
