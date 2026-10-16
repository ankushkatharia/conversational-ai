"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Slide-in side on desktop. Mobile is always a full-height bottom sheet. */
  side?: "right" | "left";
  /**
   * When true, the drawer is scoped to its nearest positioned ancestor (the
   * chat panel) instead of the viewport, and adapts to that container's size
   * via container queries. The parent must be `relative`/positioned and mark a
   * container context (`@container`).
   */
  contained?: boolean;
};

/**
 * Accessible dialog: focus is moved in on open and restored on close, Escape
 * closes it, focus is trapped within, and the background is inert to scroll.
 * When `contained`, it fills its parent container and adapts to its size.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  contained = false,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    // Only lock page scroll for viewport-level drawers; a contained drawer lives
    // inside the chat panel and must not freeze the rest of the page.
    if (!contained) document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (!contained) document.body.style.overflow = "";
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, contained]);

  if (!open) return null;

  return (
    <div
      className={cn(
        contained
          ? "absolute inset-0 z-[1000] flex items-center justify-center p-3 @sm:p-4"
          : "fixed inset-0 z-[1000]",
      )}
      role="presentation"
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/60",
          contained && "backdrop-blur-sm animate-in",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "bg-surface shadow-2xl focus:outline-none",
          contained
            ? // Centered modern dialog card, scoped to the chat panel and sized
              // to fit; grows a little on wider panels (container-query driven).
              cn(
                "relative flex max-h-full w-full max-w-sm flex-col overflow-hidden",
                "rounded-2xl border border-border animate-in @lg:max-w-md",
              )
            : // Viewport-level: bottom sheet on mobile, side sheet on desktop.
              cn(
                "absolute",
                "inset-x-0 bottom-0 top-16 rounded-t-2xl",
                "sm:inset-y-0 sm:top-0 sm:w-full sm:max-w-md sm:rounded-none",
                side === "right" ? "sm:right-0" : "sm:left-0",
              ),
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold uppercase tracking-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className={cn(
            "overflow-y-auto",
            contained ? "min-h-0 flex-1" : "h-[calc(100%-3.75rem)]",
          )}
        >
          {children}
        </div>
        {contained && (
          <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
