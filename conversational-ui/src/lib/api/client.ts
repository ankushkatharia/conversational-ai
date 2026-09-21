"use client";

/**
 * Typed API client used by client components. Every call targets the app's own
 * BFF (same-origin `/api` by default), never the LLM/commerce backend directly.
 */

import type {
  ChatStreamEvent,
  Conversation,
  Product,
  SendMessageResponse,
} from "@/lib/types";
import { publicConfig } from "@/lib/config";

function url(path: string): string {
  const base = publicConfig.apiBaseUrl.replace(/\/$/, "");
  return `${base}/api${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = "Request failed. Please try again.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep default */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  async listConversations(): Promise<Conversation[]> {
    const data = await json<{ conversations: Conversation[] }>(
      await fetch(url("/conversations"), {
        credentials: "include",
        cache: "no-store",
      }),
    );
    return data.conversations;
  },

  async createConversation(title?: string): Promise<Conversation> {
    const data = await json<{ conversation: Conversation }>(
      await fetch(url("/conversations"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title }),
      }),
    );
    return data.conversation;
  },

  async deleteConversation(id: string): Promise<void> {
    await json<{ ok: boolean }>(
      await fetch(url(`/conversations/${id}`), {
        method: "DELETE",
        credentials: "include",
      }),
    );
  },

  async getConversation(id: string): Promise<Conversation> {
    const data = await json<{ conversation: Conversation }>(
      await fetch(url(`/conversations/${id}`), {
        credentials: "include",
        cache: "no-store",
      }),
    );
    return data.conversation;
  },

  async sendMessage(
    conversationId: string,
    message: string,
  ): Promise<SendMessageResponse> {
    return json<SendMessageResponse>(
      await fetch(url(`/conversations/${conversationId}/messages`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
      }),
    );
  },

  /**
   * Streams an assistant reply. Invokes `onEvent` for each parsed SSE event.
   * Pass an `AbortSignal` to cancel generation.
   */
  async streamMessage(
    conversationId: string,
    message: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(
      url(`/conversations/${conversationId}/messages?stream=1`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
        signal,
      },
    );

    if (!res.ok || !res.body) {
      throw new ApiError("Could not start the response stream.", res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!chunk.startsWith("data:")) continue;
        const payload = chunk.slice(5).trim();
        try {
          onEvent(JSON.parse(payload) as ChatStreamEvent);
        } catch {
          /* ignore malformed keep-alive lines */
        }
      }
    }
  },
};

export type { Product };
