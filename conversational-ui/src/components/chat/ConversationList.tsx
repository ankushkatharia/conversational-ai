"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

import type { Conversation } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");

  // Debounce the search input to avoid filtering on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const filtered = useMemo(() => {
    if (!query) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.preview?.toLowerCase().includes(query),
    );
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button size="sm" className="w-full" onClick={onNew}>
          <Plus className="h-4 w-4" /> New conversation
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <label htmlFor="conv-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="conv-search"
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search conversations"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <nav aria-label="Conversations" className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">
            {conversations.length === 0
              ? "No conversations yet."
              : "No matches found."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {filtered.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg py-2 pl-3 pr-10 text-left transition-colors",
                      active
                        ? "bg-brand text-brand-foreground"
                        : "hover:bg-surface-muted",
                    )}
                  >
                    <span className="block truncate text-sm font-medium">
                      {c.title}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        active ? "text-brand-foreground/70" : "text-muted",
                      )}
                    >
                      {c.preview || "New conversation"} · {timeAgo(c.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `Delete "${c.title}"? This can't be undone.`,
                        )
                      ) {
                        onDelete(c.id);
                      }
                    }}
                    aria-label={`Delete conversation: ${c.title}`}
                    title="Delete conversation"
                    className={cn(
                      "absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100",
                      active
                        ? "text-brand-foreground/70 opacity-100 hover:bg-white/15 hover:text-brand-foreground"
                        : "text-muted hover:bg-surface hover:text-accent",
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
