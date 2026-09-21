import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  signUp: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    signUp: h.signUp,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
    user: null,
    status: "unauthenticated",
  }),
}));

import { SignUpForm } from "@/components/auth/SignUpForm";

describe("SignUpForm", () => {
  beforeEach(() => {
    h.signUp.mockReset();
    h.replace.mockReset();
  });

  it("blocks submission when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/full name/i), "Alex");
    await user.type(screen.getByLabelText(/email/i), "alex@ua.com");
    await user.type(screen.getByLabelText("Password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText(/confirm password/i), "Different1!");
    await user.click(screen.getByLabelText(/i agree/i));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it("requires accepting the terms", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/full name/i), "Alex");
    await user.type(screen.getByLabelText(/email/i), "alex@ua.com");
    await user.type(screen.getByLabelText("Password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText(/confirm password/i), "Str0ng!Pass");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByText(/must accept the terms/i)).toBeInTheDocument();
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it("submits a valid registration", async () => {
    h.signUp.mockResolvedValue({ id: "1", name: "Alex", email: "alex@ua.com" });
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText(/full name/i), "Alex");
    await user.type(screen.getByLabelText(/email/i), "alex@ua.com");
    await user.type(screen.getByLabelText("Password"), "Str0ng!Pass");
    await user.type(screen.getByLabelText(/confirm password/i), "Str0ng!Pass");
    await user.click(screen.getByLabelText(/i agree/i));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(h.signUp).toHaveBeenCalledWith({
        name: "Alex",
        email: "alex@ua.com",
        password: "Str0ng!Pass",
      }),
    );
    expect(h.replace).toHaveBeenCalledWith("/chat");
  });
});
