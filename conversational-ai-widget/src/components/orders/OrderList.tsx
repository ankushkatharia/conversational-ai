"use client";

import type { OrderSummary } from "../../lib/types";
import { cn } from "../../lib/utils";
import { OrderCard } from "./OrderCard";

export function OrderList({
  orders,
  className,
  onTrack,
  trackingOrderNo,
}: {
  orders: OrderSummary[];
  className?: string;
  /** When provided, each card renders a "Track" action. */
  onTrack?: (orderNo: string) => void;
  /** The order number currently being tracked (shows a spinner on that card). */
  trackingOrderNo?: string | null;
}) {
  if (!orders.length) return null;
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {orders.map((order) => (
        <OrderCard
          key={order.orderNo}
          order={order}
          onTrack={onTrack}
          tracking={trackingOrderNo === order.orderNo}
        />
      ))}
    </div>
  );
}
