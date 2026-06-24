// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ItemConfigPanel } from "./ItemConfigPanel";

afterEach(cleanup);

const item = {
  id: "i1",
  name: "Sword Skin",
  price: { amount: "1.0000000", currency: "USDT" },
  stock: null,
  imageUrl: "/s.png",
  metadata: {},
} as any;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ItemConfigPanel", () => {
  it("prompts to select an item when none is selected", () => {
    render(<ItemConfigPanel studioId="stu-1" item={null} onSaved={vi.fn()} />);
    expect(screen.getByTestId("config-empty")).toBeInTheDocument();
  });

  it("PATCHes the item endpoint with edited price + currency on save", async () => {
    const updated = { ...item, price: { amount: "3.0000000", currency: "XLM" } };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ item: updated }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const onSaved = vi.fn();
    render(<ItemConfigPanel studioId="stu-1" item={item} onSaved={onSaved} />);

    fireEvent.change(screen.getByTestId("config-price"), { target: { value: "3.0000000" } });
    fireEvent.change(screen.getByTestId("config-currency"), { target: { value: "XLM" } });
    fireEvent.click(screen.getByTestId("config-save"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/studios/stu-1/items/i1");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(init!.body as string);
    expect(body.priceAmount).toBe("3.0000000");
    expect(body.priceCurrency).toBe("XLM");
  });

  it("sends null stock when the unlimited box is checked", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ item }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<ItemConfigPanel studioId="stu-1" item={{ ...item, stock: 5 }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTestId("config-unlimited"));
    fireEvent.click(screen.getByTestId("config-save"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.stock).toBeNull();
  });
});
