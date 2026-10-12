"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import type { AppliedFilters, RefinementSuggestions } from "../../lib/types";
import { cn } from "../../lib/utils";
import { ActiveFilters } from "./ActiveFilters";
import { RefinementChips } from "./RefinementChips";

/**
 * Collapsible container for the active-filter bar and guided-refinement chips.
 * Starts closed so results stay clean; the shopper opens it to filter/refine.
 */
export function RefinePanel({
  filters,
  refinements,
  onRefine,
  disabled,
}: {
  filters?: AppliedFilters;
  refinements?: RefinementSuggestions;
  onRefine: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const hasRefinements =
    !!refinements &&
    (refinements.refinements.length > 0 || refinements.sorts.length > 0);
  const hasFilters =
    !!filters &&
    Boolean(
      filters.query ||
        filters.color ||
        filters.gender ||
        filters.sort ||
        filters.minPrice != null ||
        filters.maxPrice != null,
    );
  if (!hasRefinements && !hasFilters) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filter &amp; refine
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {hasFilters && filters && (
            <ActiveFilters
              filters={filters}
              refinements={refinements}
              onRemove={onRefine}
              disabled={disabled}
            />
          )}
          {hasRefinements && refinements && (
            <RefinementChips
              suggestions={refinements}
              onRefine={onRefine}
              disabled={disabled}
            />
          )}
        </div>
      )}
    </div>
  );
}
