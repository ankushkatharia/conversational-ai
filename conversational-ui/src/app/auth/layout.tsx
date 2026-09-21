import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col md:flex-row">
      {/* Brand panel (hidden on small screens). */}
      <aside className="hidden bg-brand p-10 text-brand-foreground md:flex md:w-1/2 md:flex-col md:justify-between">
        <Link href="/" aria-label="Under Armour home">
          <Logo className="h-10 invert" />
        </Link>
        <div>
          <h1 className="max-w-sm text-4xl font-extrabold uppercase leading-tight">
            The gear finds you
          </h1>
          <p className="mt-3 max-w-sm text-brand-foreground/80">
            Sign in to chat with the Under Armour shopping assistant and get
            recommendations built around how you train.
          </p>
        </div>
        <p className="text-xs text-brand-foreground/60">
          © {new Date().getFullYear()} Under Armour, Inc.
        </p>
      </aside>

      {/* Form panel. */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Link href="/" aria-label="Under Armour home">
              <Logo className="h-9 dark:invert" />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
