"use client";

import { ExternalLink } from "lucide-react";

import type { Product } from "../../lib/types";
import { cn, discountPercent, formatPrice } from "../../lib/utils";
import { ProductLink } from "../ui/ProductLink";
import { ProductBadge } from "./ProductBadge";
import { ProductImage } from "./ProductImage";
import { Rating } from "./Rating";

export type ProductCardProps = {
  product: Product;
  /** When provided, "View details" opens the detail drawer for this product. */
  onSelect?: (product: Product) => void;
  className?: string;
};

export function ProductCard({ product, onSelect, className }: ProductCardProps) {
  const {
    name,
    brand,
    price,
    originalPrice,
    currency,
    imageUrl,
    productUrl,
    availability,
    availableColors,
    availableSizes,
    rating,
    reviewCount,
  } = product;

  const discount = discountPercent(price, originalPrice);
  const priceLabel = formatPrice(price, currency);
  const originalLabel = formatPrice(originalPrice, currency);
  const outOfStock = availability?.toLowerCase().includes("out");
  const lowStock = availability?.toLowerCase().includes("low");

  return (
    <article
      className={cn(
        "ua-cai-card group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductImage
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {discount !== null && (
            <ProductBadge variant="discount">-{discount}%</ProductBadge>
          )}
          {lowStock && <ProductBadge variant="low">Low stock</ProductBadge>}
          {outOfStock && <ProductBadge variant="out">Sold out</ProductBadge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        {brand && (
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            {brand}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {name}
        </h3>

        <Rating value={rating} count={reviewCount} />

        <div className="mt-0.5 flex items-baseline gap-2">
          {priceLabel ? (
            <span className="text-[15px] font-extrabold tracking-tight text-foreground">
              {priceLabel}
            </span>
          ) : (
            <span className="text-sm text-muted">Price unavailable</span>
          )}
          {originalLabel && discount !== null && (
            <span className="text-xs text-muted line-through">{originalLabel}</span>
          )}
        </div>

        {(availableColors?.length || availableSizes?.length) && (
          <p className="text-[11px] text-muted">
            {availableColors?.length
              ? `${availableColors.length} color${availableColors.length > 1 ? "s" : ""}`
              : ""}
            {availableColors?.length && availableSizes?.length ? " · " : ""}
            {availableSizes?.length
              ? `Sizes ${availableSizes[0]}–${availableSizes[availableSizes.length - 1]}`
              : ""}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3">
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(product)}
              aria-label={`View details for ${name}`}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase tracking-wide text-brand-foreground transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              View details
            </button>
          ) : (
            productUrl && (
              <ProductLink
                href={productUrl}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase tracking-wide text-brand-foreground transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View details
              </ProductLink>
            )
          )}
          {productUrl && (
            <ProductLink
              href={productUrl}
              aria-label={`Open ${name} product page in a new tab`}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-foreground/30 hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-4 w-4" />
            </ProductLink>
          )}
        </div>
      </div>
    </article>
  );
}
