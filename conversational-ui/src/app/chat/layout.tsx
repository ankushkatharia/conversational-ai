import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";

export const metadata: Metadata = { title: "Shopping assistant" };

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader variant="app" />
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
