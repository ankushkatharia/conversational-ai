import { describe, expect, it } from "vitest";

import { mockAssistantReply } from "@/lib/mock/assistant";

describe("mockAssistantReply", () => {
  it("filters running shoes under a price", () => {
    const reply = mockAssistantReply("black running shoes under $100");
    expect(reply.products.length).toBeGreaterThan(0);
    for (const p of reply.products) {
      expect(p.price ?? 0).toBeLessThanOrEqual(100);
      expect(p.availableColors?.some((c) => c.toLowerCase().includes("black"))).toBe(
        true,
      );
    }
    expect(reply.suggestions.length).toBeGreaterThan(0);
  });

  it("returns popular picks when no filters are understood", () => {
    const reply = mockAssistantReply("hello there");
    expect(reply.products.length).toBe(4);
  });

  it("returns a no-results reply with broadening suggestions", () => {
    const reply = mockAssistantReply("purple ski boots under $5");
    expect(reply.products).toHaveLength(0);
    expect(reply.content.toLowerCase()).toContain("couldn't find");
    expect(reply.suggestions.length).toBeGreaterThan(0);
  });

  it("respects size filters", () => {
    const reply = mockAssistantReply("training shoes in size 13");
    for (const p of reply.products) {
      expect(p.availableSizes?.map((s) => s.toUpperCase())).toContain("13");
    }
  });
});
