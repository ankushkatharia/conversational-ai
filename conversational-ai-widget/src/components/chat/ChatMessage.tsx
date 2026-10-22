"use client";

import Markdown from "react-markdown";
import { AlertTriangle, Bot, RefreshCw } from "lucide-react";

import type {
  ChatMessage as ChatMessageType,
  OrderDetail,
  Product,
} from "../../lib/types";
import { cn } from "../../lib/utils";
import { ProductGrid } from "../products/ProductGrid";
import { OrderList } from "../orders/OrderList";
import { OrderTrackingPanel } from "../orders/OrderTrackingPanel";
import { OrderTrackingCard } from "../orders/OrderTrackingCard";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { RefinePanel } from "./RefinePanel";
import { TypingIndicator } from "./TypingIndicator";

export function ChatMessage({
  message,
  onSelectProduct,
  onSuggestion,
  onRetry,
  onTrackOrder,
  onViewTracking,
  trackingOrderNo,
  streaming,
}: {
  message: ChatMessageType;
  onSelectProduct: (product: Product) => void;
  onSuggestion: (prompt: string) => void;
  onRetry?: () => void;
  /** Fetch + open tracking detail for an order number. */
  onTrackOrder: (orderNo: string) => void;
  /** Open the tracking dialog with an already-loaded order detail. */
  onViewTracking: (detail: OrderDetail) => void;
  /** Order number whose tracking is currently loading (for inline spinners). */
  trackingOrderNo: string | null;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const products = message.products ?? [];
  const orders = message.orders ?? [];
  const orderDetail = message.orderDetail ?? null;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {message.status === "error" ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl rounded-tl-sm border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{message.error ?? "Something went wrong. Please try again."}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-3 py-1 text-xs font-semibold hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl rounded-tl-sm bg-surface-muted px-4 py-3 text-sm">
            {message.content ? (
              <div className={cn("ua-prose")}>
                <Markdown>{message.content}</Markdown>
              </div>
            ) : streaming ? (
              <TypingIndicator />
            ) : null}
          </div>
        )}

        {orders.length > 0 && (
          <div className="space-y-2.5">
            <OrderList
              orders={orders}
              onTrack={onTrackOrder}
              trackingOrderNo={trackingOrderNo}
            />
            <OrderTrackingPanel
              onTrack={onTrackOrder}
              busy={trackingOrderNo !== null}
            />
          </div>
        )}

        {orderDetail && (
          <div>
            <OrderTrackingCard detail={orderDetail} onViewDetails={onViewTracking} />
          </div>
        )}

        {products.length > 0 && (
          <div>
            <ProductGrid products={products} onSelect={onSelectProduct} />
          </div>
        )}

        {/* Filter & refine and suggested prompts are product-search only; hide
            them for order history / order detail responses. */}
        {products.length > 0 && !streaming && (
          <RefinePanel
            filters={message.filters}
            refinements={message.refinements}
            onRefine={onSuggestion}
          />
        )}

        {products.length > 0 &&
          message.suggestions &&
          message.suggestions.length > 0 &&
          !streaming && (
            <SuggestedPrompts prompts={message.suggestions} onSelect={onSuggestion} />
          )}
      </div>
    </div>
  );
}
