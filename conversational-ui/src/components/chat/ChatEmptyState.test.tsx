import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatEmptyState } from "@/components/chat/ChatEmptyState";

describe("ChatEmptyState", () => {
  it("greets the user and lists starter prompts", () => {
    render(<ChatEmptyState userName="Demo Athlete" onSelect={vi.fn()} />);
    expect(screen.getByText(/Hi Demo,/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /find black running shoes under \$100/i }),
    ).toBeInTheDocument();
  });

  it("fires onSelect when a starter is chosen", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ChatEmptyState onSelect={onSelect} />);
    await user.click(
      screen.getByRole("button", { name: /show me lightweight training shoes/i }),
    );
    expect(onSelect).toHaveBeenCalledWith("Show me lightweight training shoes");
  });
});
