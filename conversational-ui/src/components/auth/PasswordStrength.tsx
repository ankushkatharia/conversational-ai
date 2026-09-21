"use client";

import { cn } from "@/lib/utils";

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/** Simple heuristic password strength estimate (length + character classes). */
export function scorePassword(password: string): Strength {
  if (!password) return { score: 0, label: "Empty" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(4, score) as Strength["score"];
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  return { score: clamped, label: labels[clamped] };
}

const COLORS = [
  "bg-border",
  "bg-red-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
];

export function PasswordStrength({ password }: { password: string }) {
  const { score, label } = scorePassword(password);
  return (
    <div aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= score ? COLORS[score] : "bg-border",
            )}
          />
        ))}
      </div>
      {password && (
        <p className="mt-1 text-xs text-muted">
          Password strength: <span className="font-medium">{label}</span>
        </p>
      )}
    </div>
  );
}
