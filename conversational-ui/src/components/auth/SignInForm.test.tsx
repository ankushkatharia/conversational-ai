import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    signIn: h.signIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
    user: null,
    status: "unauthenticated",
  }),
}));

import { SignInForm } from "@/components/auth/SignInForm";

describe("SignInForm", () => {
  beforeEach(() => {
    h.signIn.mockReset();
    h.replace.mockReset();
  });

  it("shows a validation error for an invalid email and does not submit", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.clear(screen.getByLabelText(/email/i));
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it("signs in and redirects on success", async () => {
    h.signIn.mockResolvedValue({ id: "1", name: "Demo", email: "demo@ua.com" });
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.clear(screen.getByLabelText(/email/i));
    await user.type(screen.getByLabelText(/email/i), "demo@ua.com");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(h.signIn).toHaveBeenCalledWith("demo@ua.com", "password123"));
    expect(h.replace).toHaveBeenCalledWith("/chat");
  });

  it("surfaces a friendly error when sign-in fails", async () => {
    h.signIn.mockRejectedValue(new Error("Incorrect email or password."));
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.clear(screen.getByLabelText(/email/i));
    await user.type(screen.getByLabelText(/email/i), "demo@ua.com");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(pw.type).toBe("text");
  });
});
