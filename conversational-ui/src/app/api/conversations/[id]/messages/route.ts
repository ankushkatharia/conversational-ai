import { NextResponse } from "next/server";

import type { ChatMessage } from "@/lib/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { appendMessage, getConversation } from "@/lib/server/conversations";
import { generateReply, type AgentReply } from "@/lib/server/agent";
import { makeId } from "@/lib/utils";

/**
 * Send a message to a conversation.
 *
 * - Default: returns the full assistant message as JSON.
 * - `?stream=1`: returns a `text/event-stream` where the assistant text is
 *   emitted token-by-token, followed by products, suggestions and a `done`
 *   event. The client can cancel by aborting the request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!getConversation(user.id, id)) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  let text = "";
  try {
    const body = (await req.json()) as { message?: string };
    text = (body.message ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Message must not be empty." }, { status: 400 });
  }

  const userMessage: ChatMessage = {
    id: makeId("msg"),
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
    status: "complete",
  };
  appendMessage(user.id, id, userMessage);

  // Forward the conversation id as the backend sessionId so guided-refinement
  // filters accumulate deterministically across turns.
  const reply = await generateReply(text, id);

  const stream = new URL(req.url).searchParams.get("stream");
  if (stream === "1") {
    return streamReply(user.id, id, reply);
  }

  const assistantMessage: ChatMessage = {
    id: makeId("msg"),
    role: "assistant",
    content: reply.content,
    createdAt: new Date().toISOString(),
    status: "complete",
    products: reply.products,
    suggestions: reply.suggestions,
    refinements: reply.refinements,
    filters: reply.filters,
  };
  appendMessage(user.id, id, assistantMessage);

  return NextResponse.json({
    message: assistantMessage,
    products: reply.products,
    suggestions: reply.suggestions,
    refinements: reply.refinements,
    filters: reply.filters,
  });
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function streamReply(
  userId: string,
  conversationId: string,
  reply: AgentReply,
): Response {
  const encoder = new TextEncoder();
  const messageId = makeId("msg");
  const createdAt = new Date().toISOString();
  const tokens = reply.content.match(/\S+\s*/g) ?? [reply.content];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const token of tokens) {
          controller.enqueue(encoder.encode(sse({ type: "token", value: token })));
          await new Promise((r) => setTimeout(r, 18));
        }
        if (reply.products.length) {
          controller.enqueue(
            encoder.encode(sse({ type: "products", products: reply.products })),
          );
        }
        if (reply.suggestions.length) {
          controller.enqueue(
            encoder.encode(
              sse({ type: "suggestions", suggestions: reply.suggestions }),
            ),
          );
        }
        if (reply.filters) {
          controller.enqueue(
            encoder.encode(sse({ type: "filters", filters: reply.filters })),
          );
        }
        if (reply.refinements) {
          controller.enqueue(
            encoder.encode(
              sse({ type: "refinements", refinements: reply.refinements }),
            ),
          );
        }
        controller.enqueue(encoder.encode(sse({ type: "done", messageId, createdAt })));

        appendMessage(userId, conversationId, {
          id: messageId,
          role: "assistant",
          content: reply.content,
          createdAt,
          status: "complete",
          products: reply.products,
          suggestions: reply.suggestions,
          refinements: reply.refinements,
          filters: reply.filters,
        });
      } catch {
        controller.enqueue(
          encoder.encode(sse({ type: "error", message: "Streaming failed." })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
