"use client";

import { Sparkles } from "lucide-react";

import { SuggestedPrompts } from "@/components/chat/SuggestedPrompts";

const STARTERS = [
  "Find running shoes under $100",
  "Show me track pants for training",
  "Show me trendy t-shirts",
  "Show me T-shirts available in size M",
];

export function ChatEmptyState({
  userName,
  onSelect,
}: {
  userName?: string;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-2xl font-extrabold uppercase">
        {userName ? `Hi ${userName.split(" ")[0]},` : "Hi there,"} what are you
        training for?
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        Describe what you&apos;re looking for and I&apos;ll find Under Armour gear
        that fits. Try one of these to get started:
      </p>
      <div className="mt-6 max-w-lg">
        <SuggestedPrompts
          prompts={STARTERS}
          onSelect={onSelect}
          className="justify-center"
        />
      </div>
    </div>
  );
}
