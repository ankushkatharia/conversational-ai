"use client";

import { X } from "lucide-react";

import type { AppliedFilters, RefinementSuggestions } from "../../lib/types";

type ActiveChip = {
  key: string;
  label: string;
  /** Refinement prompt to send when removing this filter; null = not removable. */
  removePrompt: string | null;
};

function priceLabel(min?: number, max?: number): string | null {
  if (min != null && max != null) return `$${min}–$${max}`;
  if (max != null) return `≤ $${max}`;
  if (min != null) return `≥ $${min}`;
  return null;
}

function prettySort(id: string): string {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Builds the removable chip list from the applied filters. */
function buildChips(
  filters: AppliedFilters,
  refinements?: RefinementSuggestions,
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (filters.query) {
    chips.push({ key: "query", label: filters.query, removePrompt: null });
  }
  if (filters.gender) {
    chips.push({
      key: "gender",
      label: filters.gender,
      removePrompt: "Remove the gender filter",
    });
  }
  if (filters.color) {
    chips.push({
      key: "color",
      label: filters.color,
      removePrompt: "Remove the color filter",
    });
  }
  const price = priceLabel(filters.minPrice, filters.maxPrice);
  if (price) {
    chips.push({
      key: "price",
      label: price,
      removePrompt: "Remove the price filter",
    });
  }
  if (filters.sort) {
    const label =
      refinements?.sorts.find((s) => s.id === filters.sort)?.label ??
      prettySort(filters.sort);
    chips.push({
      key: "sort",
      label: `Sorted: ${label}`,
      removePrompt: "Reset the sort order",
    });
  }

  return chips;
}

/**
 * Active-filter bar: shows the currently applied filters as chips, each with a
 * one-click remove that sends a refinement to re-run the narrowed search.
 */
export function ActiveFilters({
  filters,
  refinements,
  onRemove,
  disabled,
}: {
  filters: AppliedFilters;
  refinements?: RefinementSuggestions;
  onRemove: (prompt: string) => void;
  disabled?: boolean;
}) {
  const chips = buildChips(filters, refinements);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      <span className="text-xs font-medium text-muted">Filters:</span>
      {chips.map((chip) =>
        chip.removePrompt ? (
          <button
            key={chip.key}
            type="button"
            disabled={disabled}
            onClick={() => onRemove(chip.removePrompt!)}
            aria-label={`Remove filter ${chip.label}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-sm transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {chip.label}
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span
            key={chip.key}
            className="inline-flex items-center rounded-full bg-brand px-3 py-1 text-sm font-medium text-brand-foreground"
          >
            {chip.label}
          </span>
        ),
      )}
    </div>
  );
}
