"use client";

import { ArrowRightLeft, X } from "lucide-react";

import type { Product } from "../../lib/types";
import { ProductImage } from "./ProductImage";

export function CompareBar({
  products,
  onCompare,
  onRemove,
  onClear,
}: {
  products: Product[];
  onCompare: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (products.length === 0) return null;

  return (
    <div className="ua-cai-msg-in flex items-center gap-3 border-t border-border bg-surface-muted px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex -space-x-2">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onRemove(p.id)}
              title={`Remove ${p.name}`}
              className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-surface bg-white transition-transform hover:scale-110 hover:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ProductImage
                src={p.imageUrl}
                alt={p.name}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-muted">
          {products.length} selected
        </span>
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onCompare}
        disabled={products.length < 2}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-bold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Compare
      </button>
    </div>
  );
}
