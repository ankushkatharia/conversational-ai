"use client";

import type { OrderSummary } from "../../lib/types";
import { cn } from "../../lib/utils";
import { OrderCard } from "./OrderCard";

export function OrderList({
  orders,
  className,
}: {
  orders: OrderSummary[];
  className?: string;
}) {
  if (!orders.length) return null;
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {orders.map((order) => (
        <OrderCard key={order.orderNo} order={order} />
      ))}
    </div>
  );
}
