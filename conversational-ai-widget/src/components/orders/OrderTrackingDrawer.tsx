"use client";

import { ExternalLink, MapPin, Package, Truck } from "lucide-react";

import type { OrderAddress, OrderDetail } from "../../lib/types";
import { cn, formatPrice } from "../../lib/utils";
import { Drawer } from "../ui/Drawer";
import { StatusBadge, formatOrderDate } from "./orderStatus";

/**
 * Centered dialog that shows full tracking detail for a single order: status,
 * per-shipment tracking numbers + links, shipping address, items, and totals.
 * Handles loading and error/not-found states. Rendered inside the chat panel
 * (`contained`) so it never escapes the widget.
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

      {detail.shippingAddress && hasAddress(detail.shippingAddress) && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Shipping address
          </h4>
          <AddressBlock address={detail.shippingAddress} />
        </section>
      )}

      {detail.items.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Items
          </h4>
          <ul className="space-y-2">
            {detail.items.map((item, i) => (
              <li key={`${item.sku}-${i}`} className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
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
                  {(item.quantity > 0 || item.fulfillmentStatus) && (
                    <p className="truncate text-[11px] text-muted">
                      {item.quantity > 0 ? `Qty ${item.quantity}` : ""}
                      {item.quantity > 0 && item.fulfillmentStatus ? " · " : ""}
                      {item.fulfillmentStatus}
                    </p>
                  )}
                </div>
                {item.price > 0 && (
                  <span className="shrink-0 text-[13px] font-semibold text-foreground">
                    {formatPrice(item.price * (item.quantity || 1), detail.currency) ?? "—"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.totals.grandTotal > 0 && (
        <dl className="space-y-1.5 border-t border-dashed border-border pt-3 text-[12.5px]">
          {detail.totals.subtotal > 0 && (
            <TotalRow
              label="Subtotal"
              value={formatPrice(detail.totals.subtotal, detail.currency)}
            />
          )}
          {detail.totals.discount !== 0 && (
            <TotalRow
              label="Discount"
              value={formatPrice(detail.totals.discount, detail.currency)}
              valueClassName="text-emerald-400"
            />
          )}
          {detail.totals.shipping > 0 && (
            <TotalRow
              label="Shipping"
              value={formatPrice(detail.totals.shipping, detail.currency)}
            />
          )}
          {detail.totals.tax > 0 && (
            <TotalRow
              label="Tax"
              value={formatPrice(detail.totals.tax, detail.currency)}
            />
          )}
          <div className="flex items-center justify-between pt-1 text-sm font-extrabold text-foreground">
            <dt>Total</dt>
            <dd>{formatPrice(detail.totals.grandTotal, detail.currency) ?? "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function hasAddress(a: OrderAddress): boolean {
  return Boolean(a.address1 || a.city || a.postalCode || a.firstName);
}

function AddressBlock({ address }: { address: OrderAddress }) {
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const cityLine = [address.city, address.stateCode, address.postalCode]
    .filter(Boolean)
    .join(", ");
  return (
    <address className="not-italic rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm leading-relaxed text-foreground">
      {name && <p className="font-semibold">{name}</p>}
      {address.address1 && <p className="text-muted">{address.address1}</p>}
      {cityLine && <p className="text-muted">{cityLine}</p>}
      {address.countryCode && <p className="text-muted">{address.countryCode}</p>}
    </address>
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
      <dd className={cn("text-foreground", valueClassName)}>{value ?? "—"}</dd>
    </div>
  );
}
