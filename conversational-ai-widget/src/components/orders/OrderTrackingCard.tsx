"use client";

import { Package, Truck } from "lucide-react";

import type { OrderDetail } from "../../lib/types";
import { cn } from "../../lib/utils";
import { StatusBadge, formatOrderDate } from "./orderStatus";

/**
 * Compact in-message summary for a directly-returned order (when the user asked
 * about a specific order number in chat). Shows the order only - number, date,
 * status - with two actions: "View details" (items/totals/address) and "Track"
 * (shipment tracking). Keeping tracking behind its own action avoids crowding
 * the order detail.
 */
export function OrderTrackingCard({
  detail,
  onViewDetails,
  onTrack,
}: {
  detail: OrderDetail;
  /** Opens the order-detail dialog (items, totals, address). */
  onViewDetails: (detail: OrderDetail) => void;
  /** Opens the tracking-only dialog (shipment numbers + links). */
  onTrack: (detail: OrderDetail) => void;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
        >
          <Package className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-mono text-sm font-bold text-foreground"
              title={detail.orderNo}
            >
              {detail.orderNo}
            </span>
            <StatusBadge status={detail.status} />
          </div>
          {detail.creationDate && (
            <p className="mt-0.5 truncate text-[11px] text-muted">
              Placed {formatOrderDate(detail.creationDate)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-border">
        <button
          type="button"
          onClick={() => onViewDetails(detail)}
          className={cn(
            "flex items-center justify-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          View details
        </button>
        <button
          type="button"
          onClick={() => onTrack(detail)}
          className="flex items-center justify-center gap-1.5 border-l border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Track
        </button>
      </div>
    </article>
  );
}
