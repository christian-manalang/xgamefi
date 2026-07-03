// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { StudioSettingsClient } from "../studio-settings-client";
import type { AdminStudioDto, ApiKeyDto, WebhookDeliveryDto } from "@xgamefi/shared";

const baseStudio: AdminStudioDto = {
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
  createdAt: new Date(0).toISOString(),
};

const baseKey: ApiKeyDto = {
  id: "k1",
  keyPrefix: "xgk_abc",
  scopes: ["ingest"],
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date(0).toISOString(),
};

const baseDelivery: WebhookDeliveryDto = {
  id: "d1",
  event: "purchase.completed",
  orderId: null,
  tradeId: null,
  url: "https://example.com/webhook",
  attempt: 0,
  maxAttempts: 3,
  status: "FAILED",
  responseStatus: 500,
  nextAttemptAt: null,
  deliveredAt: null,
  createdAt: new Date(0).toISOString(),
};

describe("StudioSettingsClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: baseStudio }), { status: 200 })),
    );
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
  });

  function renderComponent(props?: { studio?: AdminStudioDto; keys?: ApiKeyDto[]; deliveries?: WebhookDeliveryDto[] }) {
    return render(
      <StudioSettingsClient
        studio={props?.studio ?? baseStudio}
        apiKeys={props?.keys ?? [baseKey]}
        initialDeliveries={props?.deliveries ?? [baseDelivery]}
      />,
    );
  }

  it("renders studio name and slug", () => {
    renderComponent();
    expect(screen.getByText("Studio Settings")).toBeInTheDocument();
    expect(screen.getByText("gridlock")).toBeInTheDocument();
  });

  it("submits profile and webhook updates on save", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: baseStudio }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { webhookUrl: "https://example.com/webhook", secret: "whsec_xyz" } }), {
        status: 200,
      }),
    );
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
    const calls = fetchMock.mock.calls;
    expect(calls[0]?.[0]).toBe("/api/v1/studios/stu1");
    expect(calls[0]?.[1]?.method).toBe("PATCH");
    expect(calls[1]?.[0]).toBe("/api/v1/studios/stu1/webhook");
    expect(calls[1]?.[1]?.method).toBe("PATCH");
  });

  it("issues an API key and shows a copy-once warning", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { ...baseKey, id: "k2", key: "xgk_newkey" } }),
        { status: 201 },
      ),
    );
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /issue api key/i }));
    await waitFor(() => expect(screen.getByText(/xgk_newkey/)).toBeInTheDocument());
    expect(screen.getByText(/NEW API KEY — COPY NOW\. IT WILL NOT BE SHOWN AGAIN\./)).toBeInTheDocument();
  });

  it("copies a new API key to the clipboard", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { ...baseKey, id: "k3", key: "xgk_copyme" } }),
        { status: 201 },
      ),
    );
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /issue api key/i }));
    await waitFor(() => expect(screen.getByText(/xgk_copyme/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("xgk_copyme"),
    );
  });

  it("revokes an active key", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { ...baseKey, revokedAt: new Date(0).toISOString() } }),
        { status: 200 },
      ),
    );
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(screen.getByText(/REVOKED/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/studios/stu1/api-keys/k1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends a test webhook event", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { ...baseDelivery, id: "d2" } }), { status: 202 }),
    );
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /test webhook/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/studios/stu1/webhooks/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ event: "purchase.completed" }),
        }),
      ),
    );
  });

  it("retries a failed delivery", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/studios/stu1/webhooks/deliveries/d1/retry",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
