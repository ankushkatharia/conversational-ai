"use client";

import { ExternalLink } from "lucide-react";

import type { Product } from "../../lib/types";
import { discountPercent, formatPrice } from "../../lib/utils";
import { useWidgetCallbacks } from "../../context";
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import { ProductLink } from "../ui/ProductLink";
import { ProductBadge } from "./ProductBadge";
import { ProductImage } from "./ProductImage";
import { Rating } from "./Rating";

export function ProductDetailDrawer({
  product,
  open,
  onClose,
  contained = false,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  /** Render inside the chat panel (scoped to its container) instead of the viewport. */
  contained?: boolean;
}) {
  return (
    <Drawer
      open={open && !!product}
      onClose={onClose}
      title="Product details"
      contained={contained}
    >
      {product && <DrawerBody product={product} />}
    </Drawer>
  );
}

function DrawerBody({ product }: { product: Product }) {
  const { onAddToCart } = useWidgetCallbacks();
  const discount = discountPercent(product.price, product.originalPrice);
  const priceLabel = formatPrice(product.price, product.currency);
  const originalLabel = formatPrice(product.originalPrice, product.currency);
  const outOfStock = product.availability?.toLowerCase().includes("out");

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-white">
        <ProductImage src={product.imageUrl} alt={product.name} />
        {discount !== null && (
          <div className="absolute left-3 top-3">
            <ProductBadge variant="discount">-{discount}%</ProductBadge>
          </div>
        )}
      </div>

      <div>
        {product.brand && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {product.brand}
          </p>
        )}
        <h3 className="mt-1 text-lg font-bold leading-tight">{product.name}</h3>
        <div className="mt-2">
          <Rating value={product.rating} count={product.reviewCount} />
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        {priceLabel ? (
          <span className="text-2xl font-extrabold">{priceLabel}</span>
        ) : (
          <span className="text-muted">Price unavailable</span>
        )}
        {originalLabel && discount !== null && (
          <span className="text-base text-muted line-through">{originalLabel}</span>
        )}
      </div>

      {product.description && (
        <p className="text-sm leading-relaxed text-foreground/80">
          {product.description}
        </p>
      )}

      {product.availableColors?.length ? (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
            Colors
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.availableColors.map((color, i) => (
              <span
                key={`${color}-${i}`}
                className="rounded-full border border-border px-3 py-1 text-sm"
              >
                {color}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {product.availableSizes?.length ? (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
            Sizes
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.availableSizes.map((size) => (
              <span
                key={size}
                className="min-w-11 rounded-md border border-border px-3 py-1.5 text-center text-sm"
              >
                {size}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-sm">
        <span className="font-semibold">Availability: </span>
        <span className={outOfStock ? "text-muted" : "text-emerald-400"}>
          {product.availability ?? "Unknown"}
        </span>
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {product.productUrl && (
          <ProductLink
            href={product.productUrl}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            More details <ExternalLink className="h-4 w-4" />
          </ProductLink>
        )}
        {onAddToCart ? (
          <Button
            variant="secondary"
            onClick={() => onAddToCart(product.id)}
            disabled={outOfStock}
          >
            Add to bag
          </Button>
        ) : (
          <Button variant="secondary" disabled title="Coming soon">
            Add to bag (coming soon)
          </Button>
        )}
      </div>
    </div>
  );
}
