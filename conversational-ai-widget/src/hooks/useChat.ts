"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../lib/types";
import { McpClient } from "../lib/mcp-client";
import { makeId } from "../lib/utils";
import {
  chatStorageKey,
  clearChatHistory,
  loadChatHistory,
  reconcileChatUser,
  saveChatHistory,
} from "../lib/chatStorage";

/**
 * Single-session chat state for the widget. One client session id is generated
 * and forwarded to the MCP server so guided refinements accumulate. The visible
 * message history is persisted per user in the browser (localStorage) so it
 * survives closing the panel / reloading, and is cleared on logout or when the
 * shopper starts a new conversation.
 *
 * @param client - the MCP client.
 * @param userKey - a stable per-user id (e.g. customerNo or userName); null/
 *   undefined uses a shared guest bucket.
 */
export function useChat(client: McpClient, userKey?: string | null) {
  const storageKey = chatStorageKey(userKey);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadChatHistory(storageKey),
  );
  const [pending, setPending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sessionId = useRef<string>(makeId("session"));
  const abortRef = useRef<AbortController | null>(null);
  const lastUserText = useRef<string>("");

  // Tracks which key the in-memory messages belong to, and suppresses the save
  // that would otherwise fire immediately after loading a (new) user's history.
  const activeKey = useRef<string>(storageKey);
  const skipNextSave = useRef<boolean>(false);

  // When the active user changes, delete the previous user's history (logout /
  // switch) and load the new user's persisted conversation.
  useEffect(() => {
    if (storageKey === activeKey.current) return;
    reconcileChatUser(userKey);
    abortRef.current?.abort();
    activeKey.current = storageKey;
    skipNextSave.current = true;
    setMessages(loadChatHistory(storageKey));
    setStreamingId(null);
    setPending(false);
    setLoadError(null);
    sessionId.current = makeId("session");
  }, [storageKey, userKey]);

  // Persist settled history (never mid-stream, to avoid per-token writes).
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (streamingId !== null) return;
    saveChatHistory(activeKey.current, messages);
  }, [messages, streamingId]);

  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Appends a fully-formed message (e.g. a Help wizard confirmation). */
  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const send = useCallback(
    async (text: string, opts: { retry?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      lastUserText.current = trimmed;
      setLoadError(null);

      if (!opts.retry) {
        const userMessage: ChatMessage = {
          id: makeId("msg"),
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
          status: "complete",
        };
        setMessages((prev) => [...prev, userMessage]);
      }

      setPending(true);
      const assistantId = makeId("msg");
      let assistantAdded = false;
      const controller = new AbortController();
      abortRef.current = controller;

      const ensureAssistant = () => {
        if (assistantAdded) return;
        assistantAdded = true;
        setPending(false);
        setStreamingId(assistantId);
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            status: "streaming",
          },
        ]);
      };

      try {
        await client.streamMessage(
          sessionId.current,
          trimmed,
          (evt) => {
            switch (evt.type) {
              case "token":
                ensureAssistant();
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + evt.value }
                      : m,
                  ),
                );
                break;
              case "products":
                ensureAssistant();
                patchMessage(assistantId, { products: evt.products });
                break;
              case "orders":
                ensureAssistant();
                patchMessage(assistantId, { orders: evt.orders });
                break;
              case "orderDetail":
                ensureAssistant();
                patchMessage(assistantId, { orderDetail: evt.orderDetail });
                break;
              case "supportTicket":
                ensureAssistant();
                patchMessage(assistantId, { supportTicket: evt.supportTicket });
                break;
              case "interaction":
                ensureAssistant();
                patchMessage(assistantId, { interaction: evt.interaction });
                break;
              case "suggestions":
                ensureAssistant();
                patchMessage(assistantId, { suggestions: evt.suggestions });
                break;
              case "refinements":
                ensureAssistant();
                patchMessage(assistantId, { refinements: evt.refinements });
                break;
              case "filters":
                ensureAssistant();
                patchMessage(assistantId, { filters: evt.filters });
                break;
              case "done":
                ensureAssistant();
                patchMessage(assistantId, { status: "complete" });
                setStreamingId(null);
                break;
              case "error":
                throw new Error(evt.message);
            }
          },
          controller.signal,
        );
      } catch {
        if (controller.signal.aborted) {
          if (assistantAdded) patchMessage(assistantId, { status: "complete" });
          setStreamingId(null);
        } else if (!assistantAdded) {
          // Streaming never started: try the non-streaming fallback.
          try {
            const res = await client.sendMessage(sessionId.current, trimmed);
            setMessages((prev) => [...prev, res.message]);
          } catch {
            setMessages((prev) => [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: "",
                createdAt: new Date().toISOString(),
                status: "error",
                error:
                  "The assistant is unavailable right now. Please retry.",
              },
            ]);
          }
        } else {
          patchMessage(assistantId, {
            status: "error",
            error: "The response was interrupted. Please retry.",
          });
          setStreamingId(null);
        }
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [client, patchMessage],
  );

  const retry = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.status === "error") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    if (lastUserText.current) void send(lastUserText.current, { retry: true });
  }, [send]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    skipNextSave.current = true;
    clearChatHistory(activeKey.current);
    setMessages([]);
    setStreamingId(null);
    setPending(false);
    setLoadError(null);
    sessionId.current = makeId("session");
  }, []);

  return {
    messages,
    pending,
    streamingId,
    loadError,
    send,
    cancel,
    retry,
    reset,
    appendMessage,
  };
}

export type UseChat = ReturnType<typeof useChat>;
