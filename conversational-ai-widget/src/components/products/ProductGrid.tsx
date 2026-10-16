"use client";

import type { Product } from "../../lib/types";
import { cn } from "../../lib/utils";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  products,
  onSelect,
  className,
}: {
  products: Product[];
  onSelect?: (product: Product) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]",
        className,
      )}
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onSelect={onSelect} />
      ))}
    </div>
  );
}
