"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

import { useWidgetCallbacks } from "../../context";

export type ProductLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
};

function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Anchor that defers internal routes to the host via `onNavigate` and opens
 * external absolute URLs in a new tab.
 */
export function ProductLink({ href, children, onClick, ...rest }: ProductLinkProps) {
  const { onNavigate } = useWidgetCallbacks();
  const internal = isInternalPath(href);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (internal && onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      {...rest}
    >
      {children}
    </a>
  );
}
