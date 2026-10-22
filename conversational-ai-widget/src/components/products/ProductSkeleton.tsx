"use client";

import { useEffect, useRef, useState } from "react";

export function ProductSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="ua-skeleton aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        {/* brand */}
        <div className="ua-skeleton h-2.5 w-12 rounded" />
        {/* name (two lines) */}
        <div className="ua-skeleton h-4 w-3/4 rounded" />
        <div className="ua-skeleton h-4 w-1/2 rounded" />
        {/* rating */}
        <div className="ua-skeleton h-3 w-20 rounded" />
        {/* price */}
        <div className="ua-skeleton mt-0.5 h-4 w-1/3 rounded" />
        {/* colors/sizes */}
        <div className="ua-skeleton h-2.5 w-16 rounded" />
        {/* action row: primary button + icon button */}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <div className="ua-skeleton h-9 flex-1 rounded-full" />
          <div className="ua-skeleton h-9 w-9 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Min card width (keep in sync with the real product grid) and grid gap (gap-3). */
const CARD_MIN = 150;
const GRID_GAP = 12;

/**
 * Loading placeholder grid that adapts to the chat panel width: it measures its
 * own container and shows only as many columns/rows as fit, so narrow (mobile)
 * chat views render a compact 1-2 card grid instead of a tall 6-card block that
 * pushes the conversation off-screen. Pass `count` to force a fixed number.
 */
export function ProductSkeletonGrid({ count }: { count?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const compute = () => {
      const width = el.clientWidth;
      if (!width) return;
      const fit = Math.floor((width + GRID_GAP) / (CARD_MIN + GRID_GAP));
      const nextCols = Math.max(1, Math.min(4, fit));
      setCols(nextCols);
      // Only use a second row once a few columns fit, to keep mobile compact.
      setRows(nextCols >= 3 ? 2 : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = count ?? Math.min(6, Math.max(2, cols * rows));

  return (
    <div ref={ref}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: total }).map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
