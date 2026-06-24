// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { ItemCard } from "./item-card";
import type { ItemDto } from "@xgamefi/shared/dto";

const item: ItemDto = {
  id: "i1",
  studioId: "stu1",
  externalId: "sword_skin_01",
  name: "Sword Skin",
  description: "blade",
  imageUrl: null,
  price: { amount: "1.0000000", currency: "USDT" },
  stock: null,
  rarity: "LEGENDARY",
  category: "skins",
  metadata: {},
  isActive: true,
  syncedAt: null,
};

describe("ItemCard", () => {
  it("renders name, externalId, price and rarity", () => {
    render(<ItemCard item={item} />);
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/sword_skin_01/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0000000/)).toBeInTheDocument();
    expect(screen.getByText("USDT")).toBeInTheDocument();
    expect(screen.getByText("LEGENDARY")).toBeInTheDocument();
  });

  it("calls onSelect when Quick View is clicked", () => {
    const onSelect = vi.fn();
    render(<ItemCard item={item} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /quick view/i }));
    expect(onSelect).toHaveBeenCalledWith(item);
  });
});
