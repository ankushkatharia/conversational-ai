"use client";

import { cn } from "../../lib/utils";

export function SuggestedPrompts({
  prompts,
  onSelect,
  disabled,
  className,
}: {
  prompts: string[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (prompts.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Suggested prompts">
      {prompts.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className="whitespace-nowrap rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {prompt}
          </button>
        </li>
      ))}
    </ul>
  );
}
