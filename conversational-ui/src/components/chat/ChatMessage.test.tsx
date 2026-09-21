import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

import { ChatMessage } from "@/components/chat/ChatMessage";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

const noop = () => {};

describe("ChatMessage", () => {
  it("renders a user message", () => {
    const msg: ChatMessageType = {
      id: "1",
      role: "user",
      content: "Show me shoes",
      createdAt: new Date().toISOString(),
    };
    render(
      <ChatMessage message={msg} onSelectProduct={noop} onSuggestion={noop} />,
    );
    expect(screen.getByText("Show me shoes")).toBeInTheDocument();
  });

  it("renders assistant markdown and product results", () => {
    const msg: ChatMessageType = {
      id: "2",
      role: "assistant",
      content: "I found **1** option:",
      createdAt: new Date().toISOString(),
      status: "complete",
      products: [{ id: "p1", name: "UA HOVR Phantom 3", price: 89.99 }],
      suggestions: ["Show me more"],
    };
    render(
      <ChatMessage message={msg} onSelectProduct={noop} onSuggestion={noop} />,
    );
    expect(screen.getByText("1").tagName.toLowerCase()).toBe("strong");
    expect(screen.getByText("UA HOVR Phantom 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show me more" })).toBeInTheDocument();
  });

  it("renders an error state with a retry action", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const msg: ChatMessageType = {
      id: "3",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "error",
      error: "The assistant is unavailable right now.",
    };
    render(
      <ChatMessage
        message={msg}
        onSelectProduct={noop}
        onSuggestion={noop}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
