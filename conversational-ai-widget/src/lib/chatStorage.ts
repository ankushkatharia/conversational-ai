"use client";

import type { ChatMessage } from "./types";

/**
 * Browser-side (localStorage) persistence for the widget chat history.
 *
 * History is scoped per user so it never leaks between accounts, and is treated
 * as temporary: it is deleted when the active user changes (login / logout /
 * switch) and when the shopper starts a new conversation. localStorage is used
 * (not sessionStorage) so the conversation survives closing the chat panel and
 * reloading the page, while still being easy to clear.
 */

const PREFIX = "ua-cai-chat";
/** Records the currently-active storage key so we can detect user changes. */
const USER_MARKER_KEY = "ua-cai-chat-user";
/** Cap persisted history to bound localStorage usage. */
const MAX_MESSAGES = 100;

/** Builds the per-user storage key. Falls back to a shared guest bucket. */
export function chatStorageKey(userKey?: string | null): string {
  const id = (userKey ?? "").trim();
  return id ? `${PREFIX}:user:${id}` : `${PREFIX}:guest`;
}

/** Loads persisted history for a key, coercing interrupted statuses. */
export function loadChatHistory(key: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    // A message persisted mid-stream would otherwise reload stuck as "streaming".
    return parsed.map((m) =>
      m.status === "streaming" ? { ...m, status: "complete" } : m,
    );
  } catch {
    return [];
  }
}

/** Persists history for a key (trimmed to the most recent messages). */
export function saveChatHistory(key: string, messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    if (messages.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    const trimmed = messages.slice(-MAX_MESSAGES);
    window.localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    /* quota exceeded / storage unavailable: keep in-memory only */
  }
}

/** Removes all persisted history for a key. */
export function clearChatHistory(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Detects a user change (login / logout / account switch) and deletes the
 * previously-active user's persisted history, then records the new active key.
 *
 * Safe to call repeatedly and from anywhere (it is idempotent). Call it whenever
 * the active user identity changes so logout clears history even if the chat
 * panel was closed at the time.
 */
export function reconcileChatUser(userKey?: string | null): void {
  if (typeof window === "undefined") return;
  const current = chatStorageKey(userKey);
  try {
    const prev = window.localStorage.getItem(USER_MARKER_KEY);
    if (prev && prev !== current) {
      // The previously-active user signed out or switched: drop their history.
      window.localStorage.removeItem(prev);
    }
    if (prev !== current) {
      window.localStorage.setItem(USER_MARKER_KEY, current);
    }
  } catch {
    /* ignore */
  }
}
