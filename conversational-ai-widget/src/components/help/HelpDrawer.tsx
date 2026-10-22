"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  HelpCircle,
  LifeBuoy,
  Mail,
  Package,
  Phone,
  RotateCcw,
  ShoppingBag,
  Ticket,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  HelpCategory,
  HelpContactMethod,
  OrderDetail,
  SupportTicket,
} from "../../lib/types";
import type { McpClient } from "../../lib/mcp-client";
import { cn } from "../../lib/utils";
import { Drawer } from "../ui/Drawer";

type Step =
  | "menu"
  | "describe"
  | "tracking"
  | "contact"
  | "done";

const CATEGORIES: { id: HelpCategory; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "order", label: "Order issue", hint: "Track, delays, wrong items", icon: ShoppingBag },
  { id: "payment", label: "Payment issue", hint: "Charges, refunds, billing", icon: CreditCard },
  { id: "product", label: "Product issue", hint: "Quality, sizing, defects", icon: Package },
  { id: "return_refund", label: "Return / Refund", hint: "Start or check a return", icon: RotateCcw },
  { id: "other", label: "Something else", hint: "Any other question", icon: HelpCircle },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Interactive Help / Queries wizard. Guides the shopper through: pick a category
 * -> describe the problem (and, for order issues, auto-track by order number) ->
 * if unresolved, create a ticket (email) or request a call (phone). Submits via
 * the deterministic `POST /support-ticket` endpoint and shows a confirmation.
 * Rendered as a contained dialog inside the chat panel.
 */
export function HelpDrawer({
  open,
  onClose,
  client,
  userEmail,
  onTicketCreated,
}: {
  open: boolean;
  onClose: () => void;
  client: McpClient;
  /** Signed-in shopper's email, used to pre-fill the ticket form. */
  userEmail?: string;
  /** Called after a ticket is created so the chat can record a confirmation. */
  onTicketCreated?: (ticket: SupportTicket) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [description, setDescription] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState(userEmail ?? "");
  const [phone, setPhone] = useState("");

  const [tracking, setTracking] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Reset the wizard whenever it (re)opens, and pre-fill the email.
  useEffect(() => {
    if (!open) return;
    setStep("menu");
    setCategory(null);
    setDescription("");
    setOrderNumber("");
    setEmail(userEmail ?? "");
    setPhone("");
    setTracking(null);
    setBusy(false);
    setError(null);
    setTicket(null);
  }, [open, userEmail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedLabel = category
    ? CATEGORIES.find((c) => c.id === category)?.label
    : undefined;

  function pickCategory(id: HelpCategory) {
    setCategory(id);
    setError(null);
    setStep("describe");
  }

  async function findOrder() {
    const orderNo = orderNumber.trim();
    if (!orderNo) {
      setError("Enter your order number to look it up.");
      return;
    }
    setError(null);
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const detail = await client.getOrderDetail(orderNo, controller.signal);
      if (controller.signal.aborted) return;
      if (detail) {
        setTracking(detail);
        setStep("tracking");
      } else {
        setTracking(null);
        setError(
          `We couldn't find order ${orderNo}. You can create a ticket or request a call instead.`,
        );
        setStep("contact");
      }
    } catch {
      if (controller.signal.aborted) return;
      setError(
        "We couldn't look that order up right now. You can still create a ticket or request a call.",
      );
      setStep("contact");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function continueFromDescribe() {
    if (!description.trim()) {
      setError("Please describe the problem so we can help.");
      return;
    }
    setError(null);
    setStep("contact");
  }

  async function submit(method: HelpContactMethod) {
    if (!category) return;
    if (method === "ticket" && !EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email so we can follow up on your ticket.");
      return;
    }
    if (method === "call" && phone.trim().length < 7) {
      setError("Enter a phone number we can call you back on.");
      return;
    }
    setError(null);
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const created = await client.createSupportTicket(
        {
          category,
          description: description.trim(),
          preferredContact: method,
          orderNumber: orderNumber.trim() || undefined,
          contactEmail: method === "ticket" ? email.trim() : undefined,
          contactPhone: method === "call" ? phone.trim() : undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setTicket(created);
      setStep("done");
      onTicketCreated?.(created);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't submit your request right now. Please try again.",
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Help & queries" contained>
      <div className="flex flex-col gap-4 p-5">
        {step !== "menu" && step !== "done" && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (step === "describe") setStep("menu");
              else if (step === "tracking") setStep("describe");
              else if (step === "contact") setStep("describe");
            }}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}

        {step === "menu" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">How can we help?</p>
                <p className="text-xs text-muted">Pick a topic to get started.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {CATEGORIES.map(({ id, label, hint, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickCategory(id)}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {label}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "describe" && (
          <div className="flex flex-col gap-3">
            <CategoryBadge label={selectedLabel} />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Tell us what's wrong
              </span>
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe the issue in a sentence or two…"
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {category === "order" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  Order number <span className="font-normal normal-case">(optional)</span>
                </span>
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g. US-DEVNA04-00392565"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            )}

            {error && <ErrorNote message={error} />}

            <div className="flex flex-col gap-2 pt-1">
              {category === "order" && orderNumber.trim() && (
                <PrimaryButton onClick={() => void findOrder()} busy={busy}>
                  <Truck className="h-4 w-4" /> Track my order
                </PrimaryButton>
              )}
              <SecondaryButton onClick={continueFromDescribe} disabled={busy}>
                {category === "order" && orderNumber.trim()
                  ? "No, I still need help"
                  : "Continue"}
              </SecondaryButton>
            </div>
          </div>
        )}

        {step === "tracking" && tracking && (
          <div className="flex flex-col gap-3">
            <CategoryBadge label={selectedLabel} />
            <TrackingSummary detail={tracking} />
            {error && <ErrorNote message={error} />}
            <p className="text-sm font-semibold text-foreground">Did this resolve your issue?</p>
            <div className="flex flex-col gap-2">
              <PrimaryButton onClick={onClose}>
                <CheckCircle2 className="h-4 w-4" /> Yes, thanks
              </PrimaryButton>
              <SecondaryButton onClick={() => setStep("contact")}>
                No, I still need help
              </SecondaryButton>
            </div>
          </div>
        )}

        {step === "contact" && (
          <ContactStep
            selectedLabel={selectedLabel}
            email={email}
            setEmail={setEmail}
            phone={phone}
            setPhone={setPhone}
            hasUserEmail={!!userEmail}
            error={error}
            busy={busy}
            onSubmit={(method) => void submit(method)}
          />
        )}

        {step === "done" && ticket && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                {ticket.preferredContact === "call"
                  ? "Call back requested"
                  : "Ticket created"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {ticket.preferredContact === "call"
                  ? "A customer care agent will reach out shortly."
                  : "Our support team will follow up by email."}
              </p>
            </div>
            <dl className="w-full space-y-1.5 rounded-xl border border-border bg-surface-muted px-3.5 py-3 text-left text-xs">
              <Row label="Reference" value={ticket.ref} mono />
              <Row label="Topic" value={ticket.categoryLabel} />
              {ticket.orderNumber && <Row label="Order" value={ticket.orderNumber} mono />}
              {ticket.contactEmail && <Row label="Email" value={ticket.contactEmail} />}
              {ticket.contactPhone && <Row label="Phone" value={ticket.contactPhone} />}
            </dl>
            <PrimaryButton onClick={onClose}>Done</PrimaryButton>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/**
 * Single merged step: the shopper picks "Create a ticket" or "Request a call"
 * and fills in their email/phone on the same screen. When `hasUserEmail` is true
 * the email field is pre-filled and read-only, so clicking "Create a ticket"
 * submits immediately with no extra typing.
 */
function ContactStep({
  selectedLabel,
  email,
  setEmail,
  phone,
  setPhone,
  hasUserEmail,
  error,
  busy,
  onSubmit,
}: {
  selectedLabel?: string;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  hasUserEmail: boolean;
  error: string | null;
  busy: boolean;
  onSubmit: (method: HelpContactMethod) => void;
}) {
  const [method, setMethod] = useState<"ticket" | "call" | null>(
    hasUserEmail ? "ticket" : null,
  );

  return (
    <div className="flex flex-col gap-3">
      <CategoryBadge label={selectedLabel} />
      <p className="text-sm font-semibold text-foreground">
        How would you like us to help?
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMethod("ticket")}
          className={cn(
            "flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            method === "ticket"
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface text-foreground hover:bg-surface-muted",
          )}
        >
          <Ticket className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold">Email ticket</span>
        </button>
        <button
          type="button"
          onClick={() => setMethod("call")}
          className={cn(
            "flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            method === "call"
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface text-foreground hover:bg-surface-muted",
          )}
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold">Call me back</span>
        </button>
      </div>

      {method === "ticket" && !hasUserEmail && (
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Mail className="h-3.5 w-3.5" /> Your email
          </span>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      {method === "ticket" && hasUserEmail && (
        <p className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm text-muted">
          We'll send updates to <span className="font-semibold text-foreground">{email}</span>
        </p>
      )}

      {method === "call" && (
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Phone className="h-3.5 w-3.5" /> Your phone number
          </span>
          <input
            autoFocus
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +1 555 123 4567"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      {error && <ErrorNote message={error} />}

      {method && (
        <PrimaryButton onClick={() => onSubmit(method)} busy={busy}>
          {method === "ticket" ? (
            <><Ticket className="h-4 w-4" /> Submit ticket</>
          ) : (
            <><Phone className="h-4 w-4" /> Request a call</>
          )}
        </PrimaryButton>
      )}
    </div>
  );
}

function CategoryBadge({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
      {label}
    </span>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent"
    >
      {message}
    </p>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("truncate font-semibold text-foreground", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent"
        />
      ) : (
        children
      )}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function TrackingSummary({ detail }: { detail: OrderDetail }) {
  const shipments = detail.shipments.filter(
    (s) => s.trackingNumber || s.trackingLink || s.status,
  );
  return (
    <div className="rounded-xl border border-border bg-surface-muted px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Order</p>
          <p className="truncate font-mono text-sm font-bold text-foreground" title={detail.orderNo}>
            {detail.orderNo}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
          {detail.status}
        </span>
      </div>
      {shipments.length > 0 && (
        <ul className="mt-2.5 space-y-2 border-t border-dashed border-border pt-2.5">
          {shipments.map((s, i) => (
            <li key={`${s.trackingNumber ?? "ship"}-${i}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-xs text-foreground">
                {s.trackingNumber ?? s.status ?? "—"}
              </span>
              {s.trackingLink && (
                <a
                  href={s.trackingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline"
                >
                  Track <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
