import { clsx, type ClassValue } from "clsx";

/** Conditional className joiner. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Formats a price into a currency string with a graceful fallback. */
export function formatPrice(
  value: number | undefined,
  currency = "USD",
): string | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

/** Percent discount between an original and current price, or null. */
export function discountPercent(
  price?: number,
  originalPrice?: number,
): number | null {
  if (!price || !originalPrice || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/** Generates a reasonably unique id without external deps. */
export function makeId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
