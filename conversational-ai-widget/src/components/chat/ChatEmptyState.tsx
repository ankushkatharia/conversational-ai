"use client";

import { ChevronRight, LifeBuoy, Package, Ruler, Search, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type QuickAction = {
  icon: LucideIcon;
  label: string;
  prompt: string;
};

const ACTIONS: QuickAction[] = [
  {
    icon: Search,
    label: "Search for products",
    prompt: "Find running shoes under $100",
  },
  {
    icon: Sparkles,
    label: "Get recommendations",
    prompt: "Show me track pants for training",
  },
  {
    icon: Ruler,
    label: "Find my size",
    prompt: "Show me T-shirts available in size M",
  },
  {
    icon: Package,
    label: "Track my last order",
    prompt: "Track my last order",
  },
];

export function ChatEmptyState({
  userName,
  userAvatarUrl,
  onSelect,
  onOpenHelp,
}: {
  userName?: string;
  userAvatarUrl?: string;
  onSelect: (prompt: string) => void;
  /** Opens the guided Help / Queries wizard. */
  onOpenHelp?: () => void;
}) {
  const firstName = userName?.split(" ")[0];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-8">
      {userAvatarUrl ? (
        <img
          src={userAvatarUrl}
          alt={firstName ?? "Profile"}
          className="h-12 w-12 rounded-full object-cover shadow-[0_8px_24px_-6px_rgba(220,0,25,0.7)]"
        />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_8px_24px_-6px_rgba(220,0,25,0.7)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <h2 className="mt-4 text-center text-lg font-extrabold tracking-tight">
        {firstName ? `Hi ${firstName},` : "Hi there,"} how can I help?
      </h2>
      <p className="mt-1.5 max-w-xs text-center text-sm text-muted">
        Pick a quick action or type your own question below.
      </p>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
        {ACTIONS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(prompt)}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {label}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        ))}

        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
              <LifeBuoy className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              Help with an order or issue
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </div>
    </div>
  );
}
