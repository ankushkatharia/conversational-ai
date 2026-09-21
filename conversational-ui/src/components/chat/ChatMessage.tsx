"use client";

import Markdown from "react-markdown";
import { AlertTriangle, RefreshCw } from "lucide-react";

import type { ChatMessage as ChatMessageType, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductGrid } from "@/components/products/ProductGrid";
import { SuggestedPrompts } from "@/components/chat/SuggestedPrompts";
import { RefinePanel } from "@/components/chat/RefinePanel";
import { TypingIndicator } from "@/components/chat/TypingIndicator";

export function ChatMessage({
  message,
  onSelectProduct,
  onSuggestion,
  onRetry,
  streaming,
}: {
  message: ChatMessageType;
  onSelectProduct: (product: Product) => void;
  onSuggestion: (prompt: string) => void;
  onRetry?: () => void;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const products = message.products ?? [];

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground"
      >
        UA
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

        {products.length > 0 && (
          <div>
            <ProductGrid products={products} onSelect={onSelectProduct} />
          </div>
        )}

        {!streaming && (
          <RefinePanel
            filters={message.filters}
            refinements={message.refinements}
            onRefine={onSuggestion}
          />
        )}

        {message.suggestions && message.suggestions.length > 0 && !streaming && (
          <SuggestedPrompts prompts={message.suggestions} onSelect={onSuggestion} />
        )}
      </div>
    </div>
  );
}
