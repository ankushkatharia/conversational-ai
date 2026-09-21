import { Suspense } from "react";
import type { Metadata } from "next";

import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div>
      <h2 className="text-2xl font-extrabold uppercase">Welcome back</h2>
      <p className="mt-1 text-sm text-muted">
        Sign in to continue shopping with the assistant.
      </p>
      <div className="mt-6">
        <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
          <SignInForm />
        </Suspense>
      </div>
      <p className="mt-6 rounded-lg bg-surface-muted px-3 py-2 text-center text-xs text-muted">
        Demo account: <span className="font-medium">demo@underarmour.com</span> /{" "}
        <span className="font-medium">password123</span>
      </p>
    </div>
  );
}
