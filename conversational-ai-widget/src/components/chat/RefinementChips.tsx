"use client";

import { SlidersHorizontal } from "lucide-react";

import type {
  RefinementGroup,
  RefinementSuggestions,
  RefinementValue,
  SortSuggestion,
} from "../../lib/types";
import { cn } from "../../lib/utils";

/** Turns a facet value into a natural refinement prompt for the assistant. */
function refinePrompt(group: RefinementGroup, value: RefinementValue): string {
  switch (group.field) {
    case "color":
      return `Show me ${value.label.toLowerCase()} ones`;
    case "gender":
      return `Show ${value.label.toLowerCase()}`;
    case "price": {
      const { minPrice, maxPrice } = value.delta;
      if (maxPrice != null && minPrice == null) return `Filter under $${maxPrice}`;
      if (minPrice != null && maxPrice == null) return `Filter over $${minPrice}`;
      if (minPrice != null && maxPrice != null)
        return `Filter between $${minPrice} and $${maxPrice}`;
      return value.label;
    }
    default:
      return value.label;
  }
}

function Chip({
  label,
  count,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface text-foreground hover:bg-surface-muted",
      )}
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "text-xs",
            selected ? "text-brand-foreground/70" : "text-muted",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Dynamic guided-refinement chips derived from the live search results. Each
 * chip sends a short refinement prompt; the backend merges it over the
 * conversation's accumulated filters.
 */
export function RefinementChips({
  suggestions,
  onRefine,
  disabled,
}: {
  suggestions: RefinementSuggestions;
  onRefine: (prompt: string) => void;
  disabled?: boolean;
}) {
  const { refinements, sorts } = suggestions;
  const hasContent = refinements.length > 0 || sorts.length > 0;
  if (!hasContent) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Refine these results
      </p>
      <div className="flex flex-col gap-2.5">
        {refinements.map((group) => (
          <div key={group.attributeId} className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium text-muted">
              {group.label}
            </span>
            {group.values.map((value) => (
              <Chip
                key={`${group.attributeId}-${value.label}`}
                label={value.label}
                count={value.count}
                selected={value.selected}
                disabled={disabled}
                onClick={() => onRefine(refinePrompt(group, value))}
              />
            ))}
          </div>
        ))}

        {sorts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium text-muted">
              Sort
            </span>
            {sorts.map((sort: SortSuggestion) => (
              <Chip
                key={sort.id}
                label={sort.label}
                selected={sort.selected}
                disabled={disabled}
                onClick={() => onRefine(`Sort by ${sort.label.toLowerCase()}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
