"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";

import type { ChatbotWidgetProps } from "../lib/types";
import { cn } from "../lib/utils";
import { McpClient } from "../lib/mcp-client";
import { reconcileChatUser } from "../lib/chatStorage";
import { WidgetCallbacksProvider } from "../context";
import { ChatPanel } from "./ChatPanel";

/**
 * The single runtime entry point. Renders a floating launcher button and, when
 * open, the chat panel. The host supplies the MCP server URL and optional
 * navigation / cart callbacks.
 */
export function ChatbotWidget({
  mcpServerUrl,
  onNavigate,
  onAddToCart,
  className,
  title = "Shopping assistant",
  userName,
  userAvatarUrl,
  userId,
  userEmail,
  getAuthToken,
  locale,
}: ChatbotWidgetProps) {
  const [open, setOpen] = useState(false);
  const client = useMemo(
    () => new McpClient(mcpServerUrl, { getAuthToken, locale, userEmail }),
    [mcpServerUrl, getAuthToken, locale, userEmail],
  );
  const callbacks = useMemo(
    () => ({ onNavigate, onAddToCart }),
    [onNavigate, onAddToCart],
  );

  // Stable per-user id for scoping persisted chat history (prefer an explicit
  // id; fall back to the display name; else a shared guest bucket).
  const userKey = userId ?? userName ?? null;

  // Clear the previous user's persisted history on login/logout/switch, even
  // while the chat panel is closed (the panel, and its useChat, is unmounted).
  useEffect(() => {
    reconcileChatUser(userKey);
  }, [userKey]);

  return (
    <WidgetCallbacksProvider value={callbacks}>
      <div className={cn("ua-cai", className)}>
        {open && (
          <ChatPanel
            client={client}
            title={title}
            userName={userName}
            userAvatarUrl={userAvatarUrl}
            userKey={userKey}
            userEmail={userEmail}
            onClose={() => setOpen(false)}
          />
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close shopping assistant" : "Open shopping assistant"}
          className="ua-cai-launcher fixed bottom-6 right-6 z-[1001] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_12px_32px_-6px_rgba(220,0,25,0.6)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        </button>
      </div>
    </WidgetCallbacksProvider>
  );
}
