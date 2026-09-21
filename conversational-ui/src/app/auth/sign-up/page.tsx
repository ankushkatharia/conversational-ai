import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/SignUpForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div>
      <h2 className="text-2xl font-extrabold uppercase">Create your account</h2>
      <p className="mt-1 text-sm text-muted">
        Join to save conversations and get personalized picks.
      </p>
      <div className="mt-6">
        <SignUpForm />
      </div>
    </div>
  );
}
