import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

import { ProductCard } from "@/components/products/ProductCard";
import type { Product } from "@/lib/types";

const full: Product = {
  id: "p1",
  name: "UA HOVR Phantom 3",
  brand: "Under Armour",
  price: 89.99,
  originalPrice: 149.99,
  currency: "USD",
  imageUrl: "https://picsum.photos/seed/x/200/200",
  productUrl: "https://underarmour.com/p/x",
  availability: "In stock",
  availableColors: ["Black", "White"],
  availableSizes: ["8", "9", "10"],
  rating: 4.6,
  reviewCount: 1284,
};

describe("ProductCard", () => {
  it("renders name, price, and a discount badge", () => {
    render(<ProductCard product={full} />);
    expect(screen.getByText("UA HOVR Phantom 3")).toBeInTheDocument();
    expect(screen.getByText("$89.99")).toBeInTheDocument();
    expect(screen.getByText("$149.99")).toBeInTheDocument();
    expect(screen.getByText("-40%")).toBeInTheDocument();
  });

  it("gracefully handles missing optional fields", () => {
    const minimal: Product = { id: "p2", name: "Mystery Item" };
    render(<ProductCard product={minimal} />);
    expect(screen.getByText("Mystery Item")).toBeInTheDocument();
    expect(screen.getByText(/price unavailable/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/image unavailable/i)).toBeInTheDocument();
  });

  it("invokes onSelect when View details is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ProductCard product={full} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /view details for/i }));
    expect(onSelect).toHaveBeenCalledWith(full);
  });

  it("links to the product page in a new tab", () => {
    render(<ProductCard product={full} />);
    const link = screen.getByRole("link", { name: /open .* product page/i });
    expect(link).toHaveAttribute("href", full.productUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
