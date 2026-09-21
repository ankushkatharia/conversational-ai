"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PasswordStrength, scorePassword } from "@/components/auth/PasswordStrength";
import { useAuth } from "@/lib/auth/context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
};

export function SignUpForm() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: Errors = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    else if (scorePassword(password).score < 2)
      next.password = "Choose a stronger password.";
    if (confirm !== password) next.confirm = "Passwords do not match.";
    if (!terms) next.terms = "You must accept the terms to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await signUp({ name: name.trim(), email, password });
      router.replace("/chat");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unable to create account.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent"
        >
          {formError}
        </div>
      )}

      <Input
        label="Full name"
        name="name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        placeholder="Alex Athlete"
        required
      />

      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        placeholder="you@example.com"
        required
      />

      <div className="flex flex-col gap-1.5">
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          placeholder="At least 8 characters"
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <PasswordStrength password={password} />
      </div>

      <Input
        label="Confirm password"
        type={showPassword ? "text" : "password"}
        name="confirm"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        placeholder="Re-enter your password"
        required
      />

      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            aria-invalid={errors.terms ? true : undefined}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            I agree to the{" "}
            <Link href="#" className="font-medium underline">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="#" className="font-medium underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.terms && (
          <p role="alert" className="mt-1 text-xs font-medium text-accent">
            {errors.terms}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
        {submitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
