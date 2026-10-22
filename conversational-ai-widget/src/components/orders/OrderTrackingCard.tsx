"use client";

import { ChevronRight, Truck } from "lucide-react";

import type { OrderDetail } from "../../lib/types";
import { StatusBadge, formatOrderDate } from "./orderStatus";

/**
 * Compact in-message summary for a directly-returned order detail (when the user
 * asked to track a specific order number in chat). Tapping it opens the full
 * tracking dialog with the already-loaded detail.
 */
export function OrderTrackingCard({
  detail,
  onViewDetails,
}: {
  detail: OrderDetail;
  onViewDetails: (detail: OrderDetail) => void;
}) {
  const firstTracking = detail.shipments.find((s) => s.trackingNumber);

  return (
    <button
      type="button"
      onClick={() => onViewDetails(detail)}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-shadow duration-200 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
      >
        <Truck className="h-5 w-5" />
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
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {detail.creationDate ? `${formatOrderDate(detail.creationDate)} · ` : ""}
          {firstTracking?.trackingNumber
            ? `Tracking ${firstTracking.trackingNumber}`
            : "Tap to view tracking"}
        </p>
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}
