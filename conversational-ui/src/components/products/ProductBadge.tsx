import { cn } from "@/lib/utils";

type BadgeVariant = "discount" | "new" | "low" | "out" | "neutral";

const styles: Record<BadgeVariant, string> = {
  discount: "bg-accent text-accent-foreground",
  new: "bg-brand text-brand-foreground",
  low: "bg-amber-500 text-white",
  out: "bg-surface-muted text-muted",
  neutral: "bg-surface-muted text-foreground",
};

export function ProductBadge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
