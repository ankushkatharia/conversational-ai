"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";

import type { ChatInteraction as ChatInteractionType } from "../../lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Renders an inline interactive control inside an assistant message (the
 * conversational Help / Queries flow): tappable chips, a single text input
 * (email/phone/text), or a confirm button. Whatever the shopper taps/types is
 * sent back via `onSubmit` as their next chat message, so the assistant stays
 * in control of the next step.
 */
export function ChatInteraction({
  interaction,
  onSubmit,
  disabled,
}: {
  interaction: ChatInteractionType;
  onSubmit: (value: string) => void;
  /** Disables the control (e.g. while a response is streaming). */
  disabled?: boolean;
}) {
  if (interaction.type === "chips") {
    return (
      <div className="flex flex-wrap gap-2">
        {interaction.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit(opt.value)}
            className="inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-brand hover:text-brand-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (interaction.type === "text_input") {
    return (
      <TextInputInteraction
        interaction={interaction}
        onSubmit={onSubmit}
        disabled={disabled}
      />
    );
  }

  // confirm
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSubmit(interaction.confirmValue ?? interaction.prompt)}
      className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {interaction.confirmLabel ?? "Confirm"}
    </button>
  );
}

function TextInputInteraction({
  interaction,
  onSubmit,
  disabled,
}: {
  interaction: Extract<ChatInteractionType, { type: "text_input" }>;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const v = value.trim();
    if (!v) {
      setError("Please enter a value.");
      return;
    }
    if (interaction.inputType === "email" && !EMAIL_RE.test(v)) {
      setError("Enter a valid email address.");
      return;
    }
    if (interaction.inputType === "phone" && v.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number.");
      return;
    }
    setError(null);
    onSubmit(v);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type={
            interaction.inputType === "email"
              ? "email"
              : interaction.inputType === "phone"
                ? "tel"
                : "text"
          }
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            interaction.placeholder ??
            (interaction.inputType === "email"
              ? "you@example.com"
              : interaction.inputType === "phone"
                ? "+1 555 123 4567"
                : "Type your answer…")
          }
          className="h-10 flex-1 rounded-full border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          aria-label={interaction.submitLabel ?? "Send"}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {interaction.submitLabel ?? <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-1 text-[11px] text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
