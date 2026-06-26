// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const freighterMocks = vi.hoisted(() => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  signMessage: vi.fn(),
}));

vi.mock("@stellar/freighter-api", () => ({
  isConnected: freighterMocks.isConnected,
  requestAccess: freighterMocks.requestAccess,
  getAddress: freighterMocks.getAddress,
  signMessage: freighterMocks.signMessage,
}));

import { WalletConnect } from "./wallet-connect";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(responses: Record<string, () => Promise<Response>>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const handler = responses[url];
    if (handler) return handler();
    return Promise.resolve(new Response(JSON.stringify({ error: { code: "NOT_MOCKED" } }), { status: 500 }));
  });
}

describe("WalletConnect", () => {
  beforeEach(() => {
    freighterMocks.isConnected.mockResolvedValue({ isConnected: true });
    freighterMocks.requestAccess.mockResolvedValue({ address: "GPLAYER" });
    freighterMocks.getAddress.mockResolvedValue({ address: "GPLAYER" });
    freighterMocks.signMessage.mockResolvedValue({ signedMessage: "SIGNATURE_BASE64", signerAddress: "GPLAYER" });
  });

  it("shows Install Freighter when extension is not available", async () => {
    freighterMocks.isConnected.mockResolvedValue({ isConnected: false });
    render(<WalletConnect />);
    await waitFor(() => expect(screen.getByText(/install freighter/i)).toBeInTheDocument());
  });

  it("shows Connect Wallet when no player session exists", async () => {
    mockFetch({
      "/api/v1/auth/me": async () => new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }),
    });
    render(<WalletConnect />);
    await waitFor(() => expect(screen.getByTestId("wallet-connect-button")).toHaveTextContent("Connect Wallet"));
  });

  it("shows wallet address and disconnect when already authenticated", async () => {
    mockFetch({
      "/api/v1/auth/me": async () =>
        new Response(JSON.stringify({ data: { kind: "player", playerId: "p1", walletAddress: "GPLAYER123456789" } }), { status: 200 }),
    });
    render(<WalletConnect />);
    await waitFor(() => expect(screen.getByText(/GPLA\.\.\.6789/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("completes connect flow on button click", async () => {
    mockFetch({
      "/api/v1/auth/me": vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { kind: "player", playerId: "p1", walletAddress: "GPLAYER" } }), { status: 200 }),
        ),
      "/api/v1/auth/wallet/challenge": async () =>
        new Response(JSON.stringify({ data: { nonce: "testnonce" } }), { status: 200 }),
      "/api/v1/auth/wallet/verify": async () =>
        new Response(JSON.stringify({ data: { kind: "player", playerId: "p1", walletAddress: "GPLAYER" } }), { status: 200 }),
    });

    render(<WalletConnect />);
    await waitFor(() => expect(screen.getByTestId("wallet-connect-button")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("wallet-connect-button"));

    await waitFor(() => expect(screen.getByText(/GPLA\.\.\.AYER/i)).toBeInTheDocument());
  });
});
