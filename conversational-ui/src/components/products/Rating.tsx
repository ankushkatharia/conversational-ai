import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** Accessible star rating. Communicates value via text, not color alone. */
export function Rating({
  value,
  count,
  className,
}: {
  value?: number;
  count?: number;
  className?: string;
}) {
  if (value === undefined) return null;
  const rounded = Math.round(value);
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              "h-3.5 w-3.5",
              i <= rounded ? "fill-amber-400 text-amber-400" : "text-border",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted">
        {value.toFixed(1)}
        {count !== undefined && ` (${count.toLocaleString()})`}
      </span>
      <span className="sr-only">
        Rated {value.toFixed(1)} out of 5
        {count !== undefined ? ` from ${count} reviews` : ""}
      </span>
    </div>
  );
}
