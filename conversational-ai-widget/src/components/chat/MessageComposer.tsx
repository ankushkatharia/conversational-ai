"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";

export function MessageComposer({
  onSend,
  onCancel,
  streaming,
  disabled,
}: {
  onSend: (message: string) => void;
  onCancel?: () => void;
  streaming?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 rounded-[1.75rem] bg-surface-muted p-2 pl-4 shadow-sm ring-1 ring-transparent transition-all duration-150 focus-within:bg-surface focus-within:shadow-md focus-within:ring-2 focus-within:ring-foreground/70"
    >
      <label htmlFor="ua-cai-composer" className="sr-only">
        Message the shopping assistant
      </label>
      <textarea
        id="ua-cai-composer"
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow();
        }}
        onKeyDown={onKeyDown}
        placeholder="Message..."
        className="max-h-40 flex-1 resize-none self-center bg-transparent py-2.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted outline-none focus:outline-none focus-visible:outline-none"
      />

      {streaming ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Stop generating"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground transition-transform hover:bg-foreground/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm transition-all duration-150 hover:scale-105 hover:opacity-90 active:scale-95 disabled:scale-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </form>
  );
}
