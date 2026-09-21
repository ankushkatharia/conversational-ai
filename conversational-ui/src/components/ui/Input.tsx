import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  /** Element rendered at the trailing edge (e.g. show/hide password button). */
  trailing?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, trailing, className, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(error && errorId, hint && hintId) || undefined}
            className={cn(
              "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
              "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              trailing && "pr-11",
              error && "border-accent focus-visible:ring-accent",
              className,
            )}
            {...props}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              {trailing}
            </div>
          )}
        </div>
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-accent">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
