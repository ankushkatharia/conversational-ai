import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { publicConfig } from "@/lib/config";

const EXAMPLE_PROMPTS = [
  "Find black running shoes under $100",
  "What should I wear for winter training?",
  "Show me lightweight training gear",
];

export default function LandingPage() {
  return (
    <>
      <AppHeader variant="marketing" />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-brand text-brand-foreground">
          {/* Ambient animated glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div className="ua-glow absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
            <div
              className="ua-glow absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-brand-foreground/10 blur-3xl"
              style={{ animationDelay: "2s" }}
            />
          </div>

          <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-24 sm:px-6 sm:py-32">
            <p className="animate-fade-up text-sm font-bold uppercase tracking-[0.3em] text-brand-foreground/70">
              {publicConfig.appName}
            </p>
            <h1
              className="animate-fade-up max-w-3xl text-4xl font-extrabold uppercase leading-[1.05] sm:text-6xl"
              style={{ animationDelay: "0.08s" }}
            >
              Find your next advantage
            </h1>
            <p
              className="animate-fade-up max-w-xl text-base text-brand-foreground/80 sm:text-lg"
              style={{ animationDelay: "0.16s" }}
            >
              A conversational shopping assistant that helps you discover the
              right Under Armour gear. Ask a question, get real product
              recommendations, and refine until it&apos;s perfect.
            </p>

            <div
              className="animate-fade-up flex flex-wrap gap-3 pt-2"
              style={{ animationDelay: "0.24s" }}
            >
              <Link
                href="/chat"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-foreground px-7 text-sm font-bold uppercase tracking-wide text-brand transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground"
              >
                Start shopping
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/auth/sign-up"
                className="inline-flex h-12 items-center justify-center rounded-full border border-brand-foreground/40 px-7 text-sm font-bold uppercase tracking-wide transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground"
              >
                Create account
              </Link>
            </div>

            <div
              className="animate-fade-up pt-6"
              style={{ animationDelay: "0.32s" }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-foreground/60">
                Try asking
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((prompt, i) => (
                  <li
                    key={prompt}
                    className="animate-fade-up"
                    style={{ animationDelay: `${0.4 + i * 0.08}s` }}
                  >
                    <Link
                      href={`/chat?prompt=${encodeURIComponent(prompt)}`}
                      className="inline-flex rounded-full border border-brand-foreground/30 bg-brand-foreground/5 px-4 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-foreground/15 hover:shadow-md"
                    >
                      &ldquo;{prompt}&rdquo;
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </>
  );
}
