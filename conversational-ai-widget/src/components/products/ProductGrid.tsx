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
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onSelect={onSelect} />
      ))}
    </div>
  );
}
