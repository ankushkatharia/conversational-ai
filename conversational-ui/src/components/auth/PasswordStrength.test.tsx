import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PasswordStrength, scorePassword } from "@/components/auth/PasswordStrength";

describe("scorePassword", () => {
  it("scores empty and weak passwords low", () => {
    expect(scorePassword("").score).toBe(0);
    expect(scorePassword("abc").score).toBe(0);
  });

  it("rewards length and character variety", () => {
    expect(scorePassword("password123").score).toBeGreaterThanOrEqual(1);
    expect(scorePassword("Str0ng!Passw0rd").score).toBe(4);
  });
});

describe("PasswordStrength", () => {
  it("shows a label once a password is entered", () => {
    render(<PasswordStrength password="Str0ng!Passw0rd" />);
    expect(screen.getByText(/Strong/i)).toBeInTheDocument();
  });
});
