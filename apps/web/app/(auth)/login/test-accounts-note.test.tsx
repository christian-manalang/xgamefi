// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TestAccountsNote } from "./test-accounts-note";

describe("TestAccountsNote", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { cleanup(); });

  const accounts = [
    { role: "Admin", username: "admin", password: "secret" },
    { role: "Studio owner", username: "studio", password: "studio-secret" },
  ];

  it("is collapsed by default", () => {
    render(<TestAccountsNote accounts={accounts} />);
    expect(screen.getByText(/test accounts/i)).toBeTruthy();
    expect(screen.queryByText("admin")).toBeNull();
  });

  it("reveals credentials when toggled", () => {
    render(<TestAccountsNote accounts={accounts} />);
    fireEvent.click(screen.getByText(/test accounts/i));
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("secret")).toBeTruthy();
    expect(screen.getByText("studio")).toBeTruthy();
    expect(screen.getByText("studio-secret")).toBeTruthy();
  });
});
