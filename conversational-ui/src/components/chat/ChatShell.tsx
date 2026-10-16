"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, WifiOff } from "lucide-react";

import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/context";
import { useChat } from "@/components/chat/useChat";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { Drawer } from "@/components/ui/Drawer";

export function ChatShell() {
  const { user } = useAuth();
  const chat = useChat();
  const params = useSearchParams();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Start `true` so the first client render matches SSR (avoiding a hydration
  // mismatch); the effect below reconciles with the real connectivity state.
  const [online, setOnline] = useState(true);

  // Subscribe to connectivity changes to surface an honest "offline" banner.
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Auto-send a prompt passed via ?prompt= (from landing page examples).
  const initialSent = useRef(false);
  useEffect(() => {
    const initial = params.get("prompt");
    if (initial && !initialSent.current) {
      initialSent.current = true;
      void chat.send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setDetailOpen(true);
  }

  const streaming = chat.streamingId !== null;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Desktop sidebar (collapsible) */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-border bg-surface transition-[width] duration-200 ease-in-out md:block",
          sidebarOpen ? "md:w-72 border-r" : "md:w-0 border-r-0",
        )}
        aria-hidden={!sidebarOpen}
      >
        <div className="w-72">
          <ConversationList
            conversations={chat.conversations}
            activeId={chat.activeId}
            onSelect={chat.selectConversation}
            onNew={chat.newConversation}
            onDelete={chat.deleteConversation}
          />
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <Drawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        title="Conversations"
        side="left"
      >
        <ConversationList
          conversations={chat.conversations}
          activeId={chat.activeId}
          onSelect={(id) => {
            void chat.selectConversation(id);
            setMobileNavOpen(false);
          }}
          onNew={() => {
            chat.newConversation();
            setMobileNavOpen(false);
          }}
          onDelete={chat.deleteConversation}
        />
      </Drawer>

      {/* Main column (positioned container so the product detail stays within it). */}
      <div className="relative @container flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {/* Desktop: collapse/expand the persistent sidebar. */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Collapse conversations" : "Expand conversations"}
            aria-expanded={sidebarOpen}
            className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>
          {/* Mobile: open the conversations drawer. */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open conversations"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">Shopping assistant</span>
        </div>

        {!online && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-sm text-amber-700"
          >
            <WifiOff className="h-4 w-4" />
            You&apos;re offline. Messages will fail until the connection returns.
          </div>
        )}

        <ChatMessageList
          messages={chat.messages}
          pending={chat.pending}
          streamingId={chat.streamingId}
          userName={user?.name}
          onSelectProduct={openProduct}
          onSuggestion={(p) => void chat.send(p)}
          onRetry={chat.retry}
        />

        <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
          <div className="w-full">
            {chat.loadError && (
              <p role="alert" className="mb-2 text-sm text-accent">
                {chat.loadError}
              </p>
            )}
            <MessageComposer
              onSend={(m) => void chat.send(m)}
              onCancel={chat.cancel}
              streaming={streaming}
              disabled={!online}
            />
            <p className="mt-2 text-center text-xs text-muted">
              Recommendations only. Cart and checkout are coming in a future
              release.
            </p>
          </div>
        </div>

        {/* Product detail opens within the chat area and adapts to its size. */}
        <ProductDetailDrawer
          product={selectedProduct}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          contained
        />
      </div>
    </div>
  );
}
