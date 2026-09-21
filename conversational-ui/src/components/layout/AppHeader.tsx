"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, User as UserIcon } from "lucide-react";

import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

/** Top navigation bar. `variant="marketing"` is used on the landing page. */
export function AppHeader({ variant = "marketing" }: { variant?: "marketing" | "app" }) {
  const { user, status, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    router.push("/");
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6",
      )}
    >
      <Link href="/" className="shrink-0" aria-label="Under Armour home">
        <Logo className="h-8 dark:invert" />
      </Link>

      <nav className="flex items-center gap-2 sm:gap-3" aria-label="Primary">
        {status === "authenticated" && user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full border border-border py-1.5 pl-1.5 pr-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-foreground text-xs font-bold uppercase">
                {user.name.slice(0, 1)}
              </span>
              <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <UserIcon className="h-4 w-4" /> {user.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
                </div>
                <Link
                  href="/chat"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm hover:bg-surface-muted"
                >
                  Open assistant
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-accent hover:bg-surface-muted"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link
              href="/auth/sign-in"
              className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-surface-muted"
            >
              Sign in
            </Link>
            {variant === "marketing" && (
              <Button
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => router.push("/auth/sign-up")}
              >
                Create account
              </Button>
            )}
          </>
        )}
      </nav>
    </header>
  );
}
