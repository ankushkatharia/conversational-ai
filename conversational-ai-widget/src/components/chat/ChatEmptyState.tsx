"use client";

import { useMemo } from "react";
import {
  ChevronRight,
  LifeBuoy,
  Package,
  Ruler,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ChatbotWidgetProps } from "../../lib/types";

type QuickAction = {
  icon: LucideIcon;
  label: string;
  prompt: string;
};

const VISIT_KEY = "ua-cai-last-visit";

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function isReturningUser(): boolean {
  try {
    const last = localStorage.getItem(VISIT_KEY);
    localStorage.setItem(VISIT_KEY, Date.now().toString());
    return last !== null;
  } catch {
    return false;
  }
}

function buildGreeting(
  firstName?: string,
  returning?: boolean,
  pageContext?: ChatbotWidgetProps["pageContext"],
): { headline: string; subtitle: string } {
  const time = getTimeGreeting();
  const name = firstName ? ` ${firstName}` : "";

  if (returning) {
    const headline = `Welcome back${name}!`;
    const subtitle = contextSubtitle(pageContext) ?? "Ready to pick up where you left off?";
    return { headline, subtitle };
  }

  const headline = `${time}${name ? `, ${name.trim()}` : ""}!`;
  const subtitle = contextSubtitle(pageContext) ?? "How can I help you today?";
  return { headline, subtitle };
}

function contextSubtitle(
  ctx?: ChatbotWidgetProps["pageContext"],
): string | null {
  if (!ctx) return null;
  if (ctx.pageType === "pdp" && ctx.productName) {
    return `I see you're looking at ${ctx.productName}. Need help with sizing or similar options?`;
  }
  if (ctx.pageType === "plp" && ctx.categoryName) {
    return `Browsing ${ctx.categoryName}? I can help you filter or find the right fit.`;
  }
  if (ctx.pageType === "cart" && ctx.cartItemCount) {
    return `You have ${ctx.cartItemCount} item${ctx.cartItemCount > 1 ? "s" : ""} in your cart. Need help before checkout?`;
  }
  if (ctx.pageType === "order") {
    return "Need to track an order or check delivery status?";
  }
  return null;
}

function buildActions(
  pageContext?: ChatbotWidgetProps["pageContext"],
): QuickAction[] {
  const actions: QuickAction[] = [];

  if (pageContext?.pageType === "pdp" && pageContext.productName) {
    actions.push({
      icon: Ruler,
      label: `Size guide for ${truncate(pageContext.productName, 25)}`,
      prompt: `What sizes are available for ${pageContext.productName}?`,
    });
    actions.push({
      icon: Tag,
      label: "Find similar products",
      prompt: `Show me products similar to ${pageContext.productName}`,
    });
  }

  if (pageContext?.pageType === "plp" && pageContext.categoryName) {
    actions.push({
      icon: Search,
      label: `Filter ${truncate(pageContext.categoryName, 25)}`,
      prompt: `Show me the best ${pageContext.categoryName} under $100`,
    });
  }

  if (pageContext?.pageType === "cart") {
    actions.push({
      icon: ShoppingCart,
      label: "Check item availability",
      prompt: "Are all items in my cart still in stock?",
    });
  }

  if (pageContext?.pageType === "order") {
    actions.push({
      icon: Package,
      label: "Track my order",
      prompt: "Track my last order",
    });
  }

  // Fill remaining slots with defaults (up to 4 total)
  const defaults: QuickAction[] = [
    { icon: Search, label: "Search for products", prompt: "Find running shoes under $100" },
    { icon: Ruler, label: "Get size recommendation", prompt: "Help me find my size" },
    { icon: Package, label: "Track my last order", prompt: "Track my last order" },
  ];

  for (const d of defaults) {
    if (actions.length >= 4) break;
    if (!actions.some((a) => a.label === d.label)) {
      actions.push(d);
    }
  }

  return actions.slice(0, 4);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

export function ChatEmptyState({
  userName,
  userAvatarUrl,
  pageContext,
  onSelect,
  onOpenHelp,
}: {
  userName?: string;
  userAvatarUrl?: string;
  pageContext?: ChatbotWidgetProps["pageContext"];
  onSelect: (prompt: string) => void;
  onOpenHelp?: () => void;
}) {
  const firstName = userName?.split(" ")[0];
  const returning = useMemo(() => isReturningUser(), []);
  const { headline, subtitle } = useMemo(
    () => buildGreeting(firstName, returning, pageContext),
    [firstName, returning, pageContext],
  );
  const actions = useMemo(() => buildActions(pageContext), [pageContext]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center px-5 py-8">
        {userAvatarUrl ? (
          <img
            src={userAvatarUrl}
            alt={firstName ?? "Profile"}
            className="h-12 w-12 rounded-full object-cover shadow-[0_8px_24px_-6px_rgba(220,0,25,0.7)]"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_8px_24px_-6px_rgba(220,0,25,0.7)]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <h2 className="mt-4 text-center text-lg font-extrabold tracking-tight">
          {headline}
        </h2>
        <p className="mt-1.5 max-w-xs text-center text-sm text-muted">
          {subtitle}
        </p>

        <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
          {actions.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(prompt)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {label}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          ))}

          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                <LifeBuoy className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                Help with an order or issue
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
