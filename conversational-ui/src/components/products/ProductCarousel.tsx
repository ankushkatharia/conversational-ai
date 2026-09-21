"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/products/ProductCard";

/** Horizontally scrollable product rail with keyboard-accessible controls. */
export function ProductCarousel({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect?: (product: Product) => void;
}) {
  const trackRef = useRef<HTMLUListElement>(null);

  function scrollBy(dir: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * (track.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Product results"
      >
        {products.map((product) => (
          <li
            key={product.id}
            className="w-44 shrink-0 snap-start sm:w-52"
          >
            <ProductCard product={product} onSelect={onSelect} />
          </li>
        ))}
      </ul>

      {products.length > 2 && (
        <>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll products left"
            className="absolute -left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface shadow-md hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll products right"
            className="absolute -right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface shadow-md hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
