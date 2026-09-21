import type { Product } from "@/lib/types";
import { MOCK_PRODUCTS } from "@/lib/mock/products";

export type MockAssistantReply = {
  content: string;
  products: Product[];
  suggestions: string[];
};

type Filters = {
  maxPrice?: number;
  size?: string;
  colors: string[];
  categories: string[];
  keywords: string[];
};

const COLOR_WORDS = [
  "black",
  "white",
  "red",
  "blue",
  "navy",
  "grey",
  "gray",
  "yellow",
  "orange",
  "maroon",
];

const CATEGORY_HINTS: Record<string, string[]> = {
  shoe: ["shoe", "shoes", "sneaker", "running", "trainer", "footwear"],
  training: ["training", "gym", "workout", "lifting", "crossfit"],
  jacket: ["jacket", "coat", "outerwear", "winter", "cold"],
  top: ["tee", "shirt", "hoodie", "mock", "tank", "top", "fleece"],
  shorts: ["shorts", "short"],
  accessory: ["beanie", "hat", "cap", "accessory"],
};

function parseFilters(raw: string): Filters {
  const text = raw.toLowerCase();
  const colors = COLOR_WORDS.filter((c) => text.includes(c)).map((c) =>
    c === "gray" ? "grey" : c,
  );

  const priceMatch = text.match(/(?:under|below|less than|<)\s*\$?\s*(\d+)/);
  const maxPrice = priceMatch ? Number(priceMatch[1]) : undefined;

  const sizeMatch = text.match(/size\s*([0-9]{1,2}(?:\.5)?|xs|s|m|l|xl|xxl)/i);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : undefined;

  const categories: string[] = [];
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some((h) => text.includes(h))) categories.push(cat);
  }

  const keywords = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return { maxPrice, size, colors, categories, keywords };
}

function productCategory(p: Product): string {
  const n = p.name.toLowerCase();
  if (/shoe|hovr|charged|velociti|reign|machina/.test(n)) return "shoe";
  if (/jacket|storm/.test(n)) return "jacket";
  if (/shorts/.test(n)) return "shorts";
  if (/beanie|hat|cap/.test(n)) return "accessory";
  if (/tee|shirt|hoodie|mock|tank|fleece/.test(n)) return "top";
  return "other";
}

function matches(p: Product, f: Filters): boolean {
  if (f.maxPrice !== undefined && (p.price ?? Infinity) > f.maxPrice) return false;
  if (
    f.size &&
    p.availableSizes &&
    !p.availableSizes.map((s) => s.toUpperCase()).includes(f.size)
  ) {
    return false;
  }
  if (
    f.colors.length > 0 &&
    (!p.availableColors ||
      !f.colors.some((c) =>
        p.availableColors!.some((pc) => pc.toLowerCase().includes(c)),
      ))
  ) {
    return false;
  }
  if (f.categories.length > 0 && !f.categories.includes(productCategory(p))) {
    return false;
  }
  return true;
}

function describe(f: Filters): string {
  const parts: string[] = [];
  if (f.colors.length) parts.push(f.colors.join("/"));
  if (f.categories.length) parts.push(f.categories.join(" & "));
  if (f.maxPrice !== undefined) parts.push(`under $${f.maxPrice}`);
  if (f.size) parts.push(`in size ${f.size}`);
  return parts.join(" ").trim();
}

/**
 * Deterministic, offline "assistant" used in mock mode. Interprets simple
 * shopping intents and returns matching mock products plus follow-up prompts.
 */
export function mockAssistantReply(prompt: string): MockAssistantReply {
  const f = parseFilters(prompt);
  const hasFilters =
    f.maxPrice !== undefined ||
    f.size ||
    f.colors.length > 0 ||
    f.categories.length > 0;

  let results = MOCK_PRODUCTS.filter((p) => matches(p, f));

  // If no explicit filters were understood, surface popular items.
  if (!hasFilters) {
    results = [...MOCK_PRODUCTS]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 4);
  }

  const label = describe(f);

  if (results.length === 0) {
    return {
      content: `I couldn't find any products${
        label ? ` matching **${label}**` : ""
      }. Try broadening your search: remove a filter, raise your budget, or explore a different category.`,
      products: [],
      suggestions: [
        "Show me running shoes under $100",
        "Show lightweight training gear",
        "What's good for winter workouts?",
      ],
    };
  }

  const shown = results.slice(0, 6);
  const content =
    label.length > 0
      ? `I found **${results.length}** option${
          results.length === 1 ? "" : "s"
        } matching ${label}. Here are the top picks:`
      : `Here are some of our most popular picks right now:`;

  return {
    content,
    products: shown,
    suggestions: [
      "Show me more like this",
      "Show me only black colors",
      "Filter under $75",
    ],
  };
}
