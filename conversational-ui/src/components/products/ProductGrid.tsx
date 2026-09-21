"use client";

import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/products/ProductCard";

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
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className,
      )}
    >
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          onSelect={onSelect}
          priority={i < 3}
        />
      ))}
    </div>
  );
}
