"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

/**
 * Inline "track any order" entry. Lets the shopper paste/type an order number
 * and submit it to fetch that order's tracking detail. Complements the clickable
 * recent-order list (each order card has its own "Track" action).
 */
export function OrderTrackingPanel({
  onTrack,
  busy = false,
}: {
  onTrack: (orderNo: string) => void;
  /** True while any tracking lookup triggered from here is in flight. */
  busy?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onTrack(trimmed);
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-surface p-3"
    >
      <label
        htmlFor="ua-cai-track-input"
        className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted"
      >
        Track another order
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="ua-cai-track-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter order number"
            className="h-10 w-full rounded-full border border-border bg-surface-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim() || busy}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          Track
        </button>
      </div>
    </form>
  );
}
