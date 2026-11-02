"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { ExternalLink, Sparkles } from "lucide-react";

import type { Product } from "../../lib/types";
import type { McpClient } from "../../lib/mcp-client";
import { cn, discountPercent, formatPrice } from "../../lib/utils";
import { ProductImage } from "./ProductImage";
import { ProductLink } from "../ui/ProductLink";
import { Drawer } from "../ui/Drawer";
import { TypingIndicator } from "../chat/TypingIndicator";

export function ComparisonDrawer({
  open,
  onClose,
  products,
  client,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  client?: McpClient;
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || products.length < 2 || !client) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setAnalysis(null);
    client
      .compareProducts(products, controller.signal)
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch(() => {
        if (!cancelled) setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, products, client]);

  if (products.length === 0) return null;

  return (
    <Drawer open={open} onClose={onClose} title="Compare products" contained>
      <div className="flex-1 overflow-y-auto">
        {/* Product cards row */}
        <div className={cn(
          "grid gap-2.5 p-3",
          products.length === 2 ? "grid-cols-2" : products.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}>
          {products.map((p) => (
            <CompactCard key={p.id} product={p} />
          ))}
        </div>

        {/* AI Analysis section */}
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
              AI Analysis
            </span>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-4">
              <TypingIndicator />
              <span className="text-xs text-muted">Analyzing products...</span>
            </div>
          )}

          {!loading && analysis && (
            <div className="ua-cai-msg-in prose prose-invert prose-sm max-w-none text-[13px] leading-relaxed text-foreground [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:my-1 [&_li]:my-0.5 [&_li]:text-muted [&_p]:my-1.5 [&_p]:text-muted [&_strong]:text-foreground">
              <Markdown>{analysis}</Markdown>
            </div>
          )}

          {!loading && !analysis && !client && (
            <p className="py-2 text-xs text-muted">
              Comparison analysis is not available.
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function CompactCard({ product }: { product: Product }) {
  const priceLabel = formatPrice(product.price, product.currency);
  const origLabel = formatPrice(product.originalPrice, product.currency);
  const disc = discountPercent(product.price, product.originalPrice);
  const outOfStock = product.availability?.toLowerCase().includes("out");

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="h-full w-full object-cover"
        />
        {disc !== null && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            -{disc}%
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {product.brand && (
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
            {product.brand}
          </p>
        )}
        <h4 className="line-clamp-2 text-[11px] font-semibold leading-snug text-foreground">
          {product.name}
        </h4>
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="text-xs font-extrabold text-foreground">
            {priceLabel ?? "—"}
          </span>
          {origLabel && disc !== null && (
            <span className="text-[10px] text-muted line-through">{origLabel}</span>
          )}
        </div>
        {product.availableColors?.length ? (
          <p className="text-[10px] text-muted">
            {product.availableColors.length} color{product.availableColors.length > 1 ? "s" : ""}
          </p>
        ) : null}
        <p className={cn(
          "text-[10px] font-semibold",
          outOfStock ? "text-red-400" : "text-emerald-400",
        )}>
          {product.availability ?? "In Stock"}
        </p>
        {product.productUrl && (
          <ProductLink
            href={product.productUrl}
            className="mt-auto inline-flex items-center justify-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-foreground transition-opacity hover:opacity-90"
          >
            View <ExternalLink className="h-2.5 w-2.5" />
          </ProductLink>
        )}
      </div>
    </div>
  );
}
