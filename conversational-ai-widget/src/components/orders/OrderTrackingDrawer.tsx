"use client";

import { ExternalLink, Package, Truck } from "lucide-react";

import type { OrderDetail } from "../../lib/types";
import { Drawer } from "../ui/Drawer";
import { StatusBadge, formatOrderDate } from "./orderStatus";

/**
 * Centered dialog that shows TRACKING ONLY for a single order: status and
 * per-shipment tracking numbers + links + dates. Order detail (items, totals,
 * address) lives in its own dialog (`OrderDetailDrawer`) so neither view feels
 * crowded. Handles loading and error/not-found states. Rendered inside the chat
 * panel (`contained`) so it never escapes the widget.
 */
export function OrderTrackingDrawer({
  open,
  onClose,
  loading,
  error,
  detail,
  orderNo,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: OrderDetail | null;
  /** The order number being tracked (shown while loading / on error). */
  orderNo: string | null;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Order tracking" contained>
      {loading ? (
        <TrackingLoading orderNo={orderNo} />
      ) : error ? (
        <TrackingError message={error} />
      ) : detail ? (
        <TrackingBody detail={detail} />
      ) : (
        <TrackingError message="We couldn't find tracking for that order." />
      )}
    </Drawer>
  );
}

function TrackingLoading({ orderNo }: { orderNo: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      <p className="text-sm text-muted">
        Fetching tracking{orderNo ? ` for ${orderNo}` : ""}…
      </p>
    </div>
  );
}

function TrackingError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <Package className="h-8 w-8 text-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">Not available</p>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

function TrackingBody({ detail }: { detail: OrderDetail }) {
  const hasTracking = detail.shipments.some(
    (s) => s.trackingNumber || s.trackingLink || s.status,
  );
  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Order
          </p>
          <p
            className="truncate font-mono text-sm font-bold text-foreground"
            title={detail.orderNo}
          >
            {detail.orderNo}
          </p>
          {detail.creationDate && (
            <p className="mt-0.5 text-[11px] text-muted">
              Placed {formatOrderDate(detail.creationDate)}
            </p>
          )}
        </div>
        <StatusBadge status={detail.status} />
      </header>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Tracking
        </h4>
        {hasTracking ? (
          <ul className="space-y-2">
            {detail.shipments.map((s, i) => (
              <li
                key={`${s.trackingNumber ?? "ship"}-${i}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        Shipment {i + 1}
                      </p>
                      {s.status && <StatusBadge status={s.status} />}
                    </div>
                    <p className="truncate font-mono text-sm font-semibold text-foreground">
                      {s.trackingNumber ?? "—"}
                    </p>
                  </div>
                  {s.trackingLink && (
                    <a
                      href={s.trackingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-xs font-semibold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Track <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                {(s.dateShipped || s.estimatedDelivery || s.dateDelivered) && (
                  <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
                    {s.dateShipped && (
                      <div className="flex gap-1">
                        <dt className="font-semibold">Shipped</dt>
                        <dd>{formatOrderDate(s.dateShipped)}</dd>
                      </div>
                    )}
                    {s.dateDelivered ? (
                      <div className="flex gap-1">
                        <dt className="font-semibold">Delivered</dt>
                        <dd>{formatOrderDate(s.dateDelivered)}</dd>
                      </div>
                    ) : (
                      s.estimatedDelivery && (
                        <div className="flex gap-1">
                          <dt className="font-semibold">Est. delivery</dt>
                          <dd>{formatOrderDate(s.estimatedDelivery)}</dd>
                        </div>
                      )
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted">
            No tracking is available for this order yet. Check back once it ships.
          </p>
        )}
      </section>

    </div>
  );
}
