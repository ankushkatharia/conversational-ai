import { describe, expect, it } from "vitest";

import { discountPercent, formatPrice } from "@/lib/utils";

describe("formatPrice", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatPrice(100)).toBe("$100");
    expect(formatPrice(89.99)).toBe("$89.99");
  });

  it("returns null for missing values", () => {
    expect(formatPrice(undefined)).toBeNull();
    expect(formatPrice(Number.NaN)).toBeNull();
  });
});

describe("discountPercent", () => {
  it("computes rounded percent when discounted", () => {
    expect(discountPercent(75, 100)).toBe(25);
    expect(discountPercent(89.99, 149.99)).toBe(40);
  });

  it("returns null when not discounted or missing prices", () => {
    expect(discountPercent(100, 100)).toBeNull();
    expect(discountPercent(120, 100)).toBeNull();
    expect(discountPercent(undefined, 100)).toBeNull();
  });
});
