"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import type { Product } from "@/lib/types";
import { cn, discountPercent, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ProductBadge } from "@/components/products/ProductBadge";
import { ProductImage } from "@/components/products/ProductImage";
import { Rating } from "@/components/products/Rating";

export type ProductCardProps = {
  product: Product;
  /** When provided, "View details" opens the detail drawer for this product. */
  onSelect?: (product: Product) => void;
  className?: string;
  priority?: boolean;
};

export function ProductCard({ product, onSelect, className, priority }: ProductCardProps) {
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
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        <ProductImage
          src={imageUrl}
          alt={name}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
        />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {discount !== null && (
            <ProductBadge variant="discount">-{discount}%</ProductBadge>
          )}
          {lowStock && <ProductBadge variant="low">Low stock</ProductBadge>}
          {outOfStock && <ProductBadge variant="out">Sold out</ProductBadge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {brand && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {brand}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {name}
        </h3>

        <Rating value={rating} count={reviewCount} />

        <div className="flex items-baseline gap-2">
          {priceLabel ? (
            <span className="text-base font-bold">{priceLabel}</span>
          ) : (
            <span className="text-sm text-muted">Price unavailable</span>
          )}
          {originalLabel && discount !== null && (
            <span className="text-sm text-muted line-through">{originalLabel}</span>
          )}
        </div>

        {(availableColors?.length || availableSizes?.length) && (
          <p className="text-xs text-muted">
            {availableColors?.length
              ? `${availableColors.length} color${availableColors.length > 1 ? "s" : ""}`
              : ""}
            {availableColors?.length && availableSizes?.length ? " · " : ""}
            {availableSizes?.length
              ? `Sizes ${availableSizes[0]}–${availableSizes[availableSizes.length - 1]}`
              : ""}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          {onSelect ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onSelect(product)}
              aria-label={`View details for ${name}`}
            >
              View details
            </Button>
          ) : (
            productUrl && (
              <Link
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-foreground/20 text-sm font-semibold uppercase tracking-wide hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View details
              </Link>
            )
          )}
          {productUrl && (
            <Link
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${name} product page in a new tab`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
