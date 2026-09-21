/**
 * In-memory conversation store, scoped per user. Lives for the server process
 * lifetime; swap for a real database later. Server-only module.
 */

import type { ChatMessage, Conversation } from "@/lib/types";
import { makeId } from "@/lib/utils";

type StoredConversation = Conversation & { messages: ChatMessage[] };

const byUser = new Map<string, StoredConversation[]>();

function list(userId: string): StoredConversation[] {
  if (!byUser.has(userId)) byUser.set(userId, []);
  return byUser.get(userId)!;
}

/** Returns conversations (without full message arrays) newest-first. */
export function listConversations(userId: string): Conversation[] {
  return [...list(userId)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages, ...meta }) => ({
      ...meta,
      preview: messages[messages.length - 1]?.content?.slice(0, 120),
    }));
}

export function getConversation(
  userId: string,
  id: string,
): StoredConversation | undefined {
  return list(userId).find((c) => c.id === id);
}

export function createConversation(
  userId: string,
  title = "New conversation",
): Conversation {
  const now = new Date().toISOString();
  const convo: StoredConversation = {
    id: makeId("conv"),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  list(userId).unshift(convo);
  return convo;
}

/** Removes a conversation. Returns true if one was deleted. */
export function deleteConversation(userId: string, id: string): boolean {
  const arr = list(userId);
  const idx = arr.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  return true;
}

export function appendMessage(
  userId: string,
  conversationId: string,
  message: ChatMessage,
): StoredConversation | undefined {
  const convo = getConversation(userId, conversationId);
  if (!convo) return undefined;
  convo.messages.push(message);
  convo.updatedAt = message.createdAt;
  // Derive a friendly title from the first user message.
  if (convo.title === "New conversation" && message.role === "user") {
    convo.title = message.content.slice(0, 48);
  }
  return convo;
}
