"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage, Conversation, Product } from "@/lib/types";
import { api, ApiError } from "@/lib/api/client";
import { makeId } from "@/lib/utils";

type Status = "idle" | "loading";

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastUserText = useRef<string>("");

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await api.listConversations());
    } catch {
      /* non-fatal: sidebar can stay empty */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshConversations();
      setStatus("idle");
    })();
  }, [refreshConversations]);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages([]);
    try {
      const convo = await api.getConversation(id);
      setMessages(convo.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      // Optimistically remove from the sidebar; clear the view if it was active.
      setConversations((cs) => cs.filter((c) => c.id !== id));
      setActiveId((current) => {
        if (current === id) {
          setMessages([]);
          return null;
        }
        return current;
      });
      try {
        await api.deleteConversation(id);
      } catch {
        // Failed: re-sync the sidebar so the entry reappears.
        await refreshConversations();
      }
    },
    [refreshConversations],
  );

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

  const send = useCallback(
    async (text: string, opts: { retry?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      lastUserText.current = trimmed;

      // Ensure a conversation exists.
      let convId = activeId;
      if (!convId) {
        try {
          const convo = await api.createConversation(trimmed.slice(0, 48));
          convId = convo.id;
          setActiveId(convo.id);
        } catch (err) {
          setLoadError(
            err instanceof ApiError ? err.message : "Could not start a conversation.",
          );
          return;
        }
      }

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
        await api.streamMessage(
          convId,
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
          // Cancelled: keep whatever streamed so far as a complete message.
          if (assistantAdded) patchMessage(assistantId, { status: "complete" });
          setStreamingId(null);
        } else if (!assistantAdded) {
          // Streaming never started: try the non-streaming fallback.
          try {
            const res = await api.sendMessage(convId, trimmed);
            setMessages((prev) => [...prev, res.message]);
          } catch (fallbackErr) {
            setMessages((prev) => [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: "",
                createdAt: new Date().toISOString(),
                status: "error",
                error:
                  fallbackErr instanceof ApiError
                    ? fallbackErr.message
                    : "The assistant is unavailable right now. Please retry.",
              },
            ]);
          }
        } else {
          // Streaming started then failed mid-way.
          patchMessage(assistantId, {
            status: "error",
            error: "The response was interrupted. Please retry.",
          });
          setStreamingId(null);
        }
      } finally {
        setPending(false);
        abortRef.current = null;
        void refreshConversations();
      }
    },
    [activeId, patchMessage, refreshConversations],
  );

  const retry = useCallback(() => {
    // Drop a trailing errored assistant message, then resend the last prompt.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.status === "error") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    if (lastUserText.current) void send(lastUserText.current, { retry: true });
  }, [send]);

  return {
    conversations,
    activeId,
    messages,
    pending,
    streamingId,
    status,
    loadError,
    send,
    cancel,
    retry,
    selectConversation,
    newConversation,
    deleteConversation,
  };
}

export type UseChat = ReturnType<typeof useChat>;
export type { Product };
