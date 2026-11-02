"use client";

import { useState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";

import type {
  ChatInteraction,
  HelpCategory,
  HelpContactMethod,
  SupportTicket,
} from "../../lib/types";
import type { McpClient } from "../../lib/mcp-client";
import { cn } from "../../lib/utils";

type TicketFormInteraction = Extract<ChatInteraction, { type: "ticket_form" }>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Deterministic inline ticket form rendered in the chat. No LLM involved.
 * Collects description + email, then calls the API directly.
 */
export function TicketFormCard({
  interaction,
  client,
}: {
  interaction: TicketFormInteraction;
  client: McpClient;
}) {
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(interaction.prefillEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);

  const hasEmail = !!interaction.prefillEmail;
  const method: HelpContactMethod = interaction.contactMethod ?? "ticket";

  async function submit() {
    if (!description.trim() || description.trim().length < 5) {
      setError("Please describe your issue so our team can help.");
      return;
    }
    if (method === "ticket" && !EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const created = await client.createSupportTicket({
        category: interaction.category ?? "other",
        description: description.trim(),
        preferredContact: method,
        orderNumber: interaction.orderNumber,
        contactEmail: method === "ticket" ? email.trim() : undefined,
      });
      setTicket(created);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your ticket right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Ticket created</p>
            <p className="truncate font-mono text-xs text-muted">{ticket.ref}</p>
          </div>
        </div>
        <dl className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Topic</dt>
            <dd className="truncate font-semibold text-foreground">{ticket.categoryLabel}</dd>
          </div>
          {ticket.description && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted">Issue</dt>
              <dd className="text-foreground leading-relaxed">{ticket.description}</dd>
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
          {ticket.orderNumber && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Order</dt>
              <dd className="truncate font-mono font-semibold text-foreground">{ticket.orderNumber}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
      <p className="mb-3 text-sm font-bold text-foreground">{interaction.prompt}</p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Describe your issue
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Tell us what happened so our team can help faster..."
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {method === "ticket" && !hasEmail && (
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              <Mail className="h-3.5 w-3.5" /> Your email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}

        {method === "ticket" && hasEmail && (
          <p className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-muted">
            We'll email updates to{" "}
            <span className="font-semibold text-foreground">{email}</span>
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
          ) : (
            <>
              <Send className="h-4 w-4" /> Submit ticket
            </>
          )}
        </button>
      </div>
    </div>
  );
}
