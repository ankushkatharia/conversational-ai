"use client";

import { useState } from "react";
import { ChevronDown, Package } from "lucide-react";

import type { OrderSummary } from "../../lib/types";
import { cn, formatPrice } from "../../lib/utils";

type StatusTone = "success" | "info" | "warning" | "neutral";

const STATUS_TONES: Record<string, StatusTone> = {
  delivered: "success",
  shipped: "info",
  processing: "info",
  allocated: "warning",
  pending: "warning",
  cancelled: "neutral",
  returned: "neutral",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success:
    "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  info: "bg-sky-500/15 text-sky-400 border border-sky-500/25",
  warning: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  neutral: "bg-surface-muted text-muted border border-border",
};

function statusTone(status: string): StatusTone {
  return STATUS_TONES[status.toLowerCase()] ?? "info";
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return parsed.toLocaleDateString();
  }
}

function shortOrderNo(orderNo: string): string {
  const parts = orderNo.split("-");
  return parts[parts.length - 1] ?? orderNo;
}

function totalItemCount(order: OrderSummary): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function OrderCard({ order }: { order: OrderSummary }) {
  const [expanded, setExpanded] = useState(false);
  const primary = order.items[0];
  const itemCount = totalItemCount(order);
  const extraItems = order.items.length > 1 ? order.items.length - 1 : 0;
  const tone = statusTone(order.status);

  return (
    <article className="ua-cai-order flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-shadow duration-200 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Order
          </span>
          <span
            className="truncate text-sm font-extrabold tracking-tight text-foreground"
            title={order.orderNo}
          >
            #{shortOrderNo(order.orderNo)}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
            TONE_CLASSES[tone],
          )}
        >
          {order.status}
        </span>
      </header>

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white">
          {primary?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primary.imageUrl}
              alt={primary.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-muted text-muted">
              <Package className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {primary?.name ?? "Order items"}
          </p>
          <p className="text-[11px] text-muted">
            {formatDate(order.creationDate)}
            <span className="mx-1.5 text-muted/60" aria-hidden="true">
              •
            </span>
            {itemCount} {itemCount === 1 ? "item" : "items"}
            {extraItems > 0 && (
              <span className="text-muted/80"> (+{extraItems} more)</span>
            )}
          </p>
          <p className="pt-0.5 text-[15px] font-extrabold tracking-tight text-foreground">
            {formatPrice(order.totals.grandTotal, order.currency)}
          </p>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {order.items.length > 1 && (
            <ul className="space-y-2">
              {order.items.map((item) => (
                <li
                  key={`${order.orderNo}-${item.sku}`}
                  className="flex items-center gap-3"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-surface-muted text-muted">
                        <Package className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {item.name}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      SKU {item.sku} · Qty {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-foreground">
                    {formatPrice(item.price * item.quantity, order.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-1.5 border-y border-dashed border-border py-3 text-[12.5px]">
            <TotalRow
              label="Subtotal"
              value={formatPrice(order.totals.subtotal, order.currency)}
            />
            {order.totals.discount !== 0 && (
              <TotalRow
                label="Discount"
                value={formatPrice(order.totals.discount, order.currency)}
                valueClassName="text-emerald-400"
              />
            )}
            <TotalRow
              label="Shipping"
              value={formatPrice(order.totals.shipping, order.currency)}
            />
            <TotalRow
              label="Tax"
              value={formatPrice(order.totals.tax, order.currency)}
            />
            <div className="flex items-center justify-between pt-1 text-sm font-extrabold text-foreground">
              <dt>Total</dt>
              <dd>{formatPrice(order.totals.grandTotal, order.currency)}</dd>
            </div>
          </dl>

          <p className="font-mono text-[11px] tracking-tight text-muted">
            {order.orderNo}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expanded ? "Show less" : "Show more"}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
    </article>
  );
}

function TotalRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between text-muted">
      <dt>{label}</dt>
      <dd className={cn("text-foreground", valueClassName)}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
