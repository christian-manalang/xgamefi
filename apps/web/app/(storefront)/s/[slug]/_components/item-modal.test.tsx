// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { ItemModal } from "./item-modal";
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

describe("ItemModal", () => {
  let originalShowModal: typeof HTMLDialogElement.prototype.showModal;
  let originalClose: typeof HTMLDialogElement.prototype.close;

  beforeAll(() => {
    originalShowModal = HTMLDialogElement.prototype.showModal;
    originalClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });

  afterAll(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
  });

  it("renders item details when open", () => {
    render(<ItemModal item={item} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sword Skin")).toBeInTheDocument();
    expect(screen.getByText(/blade/)).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<ItemModal item={item} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
