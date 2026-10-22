"use client";

import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";

import type {
  ChatMessage as ChatMessageType,
  OrderDetail,
  Product,
} from "../../lib/types";
import { ChatMessage } from "./ChatMessage";
import { ChatEmptyState } from "./ChatEmptyState";
import { ProductSkeletonGrid } from "../products/ProductSkeleton";
import { TypingIndicator } from "./TypingIndicator";

export function ChatMessageList({
  messages,
  pending,
  streamingId,
  userName,
  userAvatarUrl,
  onSelectProduct,
  onSuggestion,
  onRetry,
  onTrackOrder,
  onViewTracking,
  onViewOrderDetail,
  onOpenHelp,
  trackingOrderNo,
}: {
  messages: ChatMessageType[];
  /** True while waiting for the assistant before any tokens have streamed. */
  pending: boolean;
  streamingId: string | null;
  userName?: string;
  userAvatarUrl?: string;
  onSelectProduct: (product: Product) => void;
  onSuggestion: (prompt: string) => void;
  onRetry: () => void;
  onTrackOrder: (orderNo: string) => void;
  onViewTracking: (detail: OrderDetail) => void;
  onViewOrderDetail: (detail: OrderDetail) => void;
  /** Opens the Help / Queries wizard (from the empty-state entry). */
  onOpenHelp: () => void;
  trackingOrderNo: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  if (messages.length === 0 && !pending) {
    return (
      <ChatEmptyState
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        onSelect={onSuggestion}
        onOpenHelp={onOpenHelp}
      />
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      <div className="flex w-full flex-col gap-6 px-4 py-6">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            streaming={message.id === streamingId}
            onSelectProduct={onSelectProduct}
            onSuggestion={onSuggestion}
            onRetry={message.status === "error" ? onRetry : undefined}
            onTrackOrder={onTrackOrder}
            onViewTracking={onViewTracking}
            onViewOrderDetail={onViewOrderDetail}
            trackingOrderNo={trackingOrderNo}
          />
        ))}

        {pending && (
          <div className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
            >
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="inline-flex rounded-2xl rounded-tl-sm bg-surface-muted px-4 py-3">
                <TypingIndicator />
              </div>
              <ProductSkeletonGrid />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
