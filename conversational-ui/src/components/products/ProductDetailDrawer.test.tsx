import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import type { Product } from "@/lib/types";

const product: Product = {
  id: "p1",
  name: "UA HOVR Phantom 3",
  description: "Zero-gravity feel.",
  brand: "Under Armour",
  price: 89.99,
  currency: "USD",
  availability: "In stock",
  availableColors: ["Black"],
  availableSizes: ["9", "10"],
  productUrl: "https://underarmour.com/p/x",
};

describe("ProductDetailDrawer", () => {
  it("renders product details in an accessible dialog", () => {
    render(<ProductDetailDrawer product={product} open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("UA HOVR Phantom 3")).toBeInTheDocument();
    expect(screen.getByText("Zero-gravity feel.")).toBeInTheDocument();
    expect(screen.getByText(/add to bag/i)).toBeDisabled();
  });

  it("calls onClose when the close button is used", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ProductDetailDrawer product={product} open onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(<ProductDetailDrawer product={product} open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
