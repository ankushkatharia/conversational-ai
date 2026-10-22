"use client";

import { CheckCircle2, Mail, Phone } from "lucide-react";

import type { SupportTicket } from "../../lib/types";

/**
 * Compact confirmation card for a created support ticket / call-back request,
 * rendered inline in the chat transcript.
 */
export function SupportTicketCard({ ticket }: { ticket: SupportTicket }) {
  const isCall = ticket.preferredContact === "call";
  return (
    <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {isCall ? "Call back requested" : "Ticket created"}
          </p>
          <p className="truncate font-mono text-xs text-muted" title={ticket.ref}>
            {ticket.ref}
          </p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Topic</dt>
          <dd className="truncate font-semibold text-foreground">{ticket.categoryLabel}</dd>
        </div>
        {ticket.orderNumber && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Order</dt>
            <dd className="truncate font-mono font-semibold text-foreground">{ticket.orderNumber}</dd>
          </div>
        )}
        {ticket.contactEmail && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1 text-muted">
              <Mail className="h-3 w-3" /> Email
            </dt>
            <dd className="truncate font-semibold text-foreground">{ticket.contactEmail}</dd>
          </div>
        )}
        {ticket.contactPhone && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1 text-muted">
              <Phone className="h-3 w-3" /> Phone
            </dt>
            <dd className="truncate font-semibold text-foreground">{ticket.contactPhone}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
