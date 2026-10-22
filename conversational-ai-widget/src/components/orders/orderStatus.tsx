"use client";

import { cn } from "../../lib/utils";

type StatusTone = "success" | "info" | "warning" | "neutral";

const STATUS_TONES: Record<string, StatusTone> = {
  delivered: "success",
  shipped: "info",
  processing: "info",
  allocated: "warning",
  pending: "warning",
  cancelled: "neutral",
  returned: "neutral",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  info: "bg-sky-500/15 text-sky-400 border border-sky-500/25",
  warning: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  neutral: "bg-surface-muted text-muted border border-border",
};

/** Maps an order status string to a semantic badge tone. */
export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status.toLowerCase()] ?? "info";
}

/** A pill badge that colors an order status by its semantic tone. */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        TONE_CLASSES[statusTone(status)],
        className,
      )}
    >
      {status}
    </span>
  );
}

/** Formats an ISO date into a short, human-readable date. */
export function formatOrderDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return parsed.toLocaleDateString();
  }
}

/** Returns the short (trailing) segment of a hyphenated order number. */
export function shortOrderNo(orderNo: string): string {
  const parts = orderNo.split("-");
  return parts[parts.length - 1] ?? orderNo;
}
