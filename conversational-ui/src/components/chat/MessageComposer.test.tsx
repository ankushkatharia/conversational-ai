import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageComposer } from "@/components/chat/MessageComposer";

describe("MessageComposer", () => {
  it("disables send until there is text", () => {
    render(<MessageComposer onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("sends the trimmed message and clears the field", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText(/message the shopping assistant/i);
    await user.type(box, "  running shoes  ");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(onSend).toHaveBeenCalledWith("running shoes");
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("sends on Enter but not Shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageComposer onSend={onSend} />);
    const box = screen.getByLabelText(/message the shopping assistant/i);
    await user.type(box, "hello{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
    await user.type(box, "{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("shows a stop button while streaming and calls onCancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<MessageComposer onSend={vi.fn()} onCancel={onCancel} streaming />);
    await user.click(screen.getByRole("button", { name: /stop generating/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
