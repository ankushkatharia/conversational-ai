/**
 * Server-side conversation orchestrator.
 *
 * In mock mode (USE_MOCK=true, the default) it answers entirely offline using
 * the deterministic mock assistant. Otherwise it proxies to the real backend
 * (mcp-uacapi HTTP API): POST /agent returns both the conversational `answer`
 * and a structured `products` array, which we render directly as cards (no
 * markdown parsing). Falls back to mock data if the backend is unreachable.
 * The browser never talks to the backend directly.
 *
 * Server-only module.
 */

import type {
  AppliedFilters,
  Product,
  RefinementSuggestions,
} from "@/lib/types";
import { serverConfig } from "@/lib/config";
import { mockAssistantReply } from "@/lib/mock/assistant";

export type AgentReply = {
  content: string;
  products: Product[];
  suggestions: string[];
  refinements?: RefinementSuggestions;
  filters?: AppliedFilters;
};

type PriceBand = { min?: number; max?: number } | null;
type BackendProduct = {
  id?: string;
  style?: string;
  name?: string;
  url?: string;
  orderable?: boolean;
  currency?: string;
  price?: { list?: PriceBand; sale?: PriceBand } | null;
  imageUrl?: string | null;
  colors?: Array<{ name?: string; code?: string; imageUrl?: string } | null> | null;
};

/** Builds a UA scene7 image URL from a style + color code as a fallback. */
function scene7Url(style?: string, code?: string): string | undefined {
  if (!style || !code) return undefined;
  return (
    `https://underarmour.scene7.com/is/image/Underarmour/${style}-${code}_DEFAULT` +
    "?rp=standard-30pad&scl=1&fmt=jpg&qlt=85&wid=400&hei=400&size=280,280&cache=on,off&resMode=sharp2"
  );
}

/** Maps the backend's stable search product shape into our UI Product type. */
function mapBackendProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as BackendProduct;
  const sale = p.price?.sale ?? undefined;
  const list = p.price?.list ?? undefined;
  const price = sale?.min ?? list?.min ?? undefined;
  const originalPrice =
    sale?.min && list?.min && list.min > sale.min ? list.min : undefined;
  const colorList = Array.isArray(p.colors)
    ? p.colors.filter((c): c is NonNullable<typeof c> => Boolean(c))
    : [];
  const colors = [
    ...new Set(
      colorList.map((c) => c.name).filter((n): n is string => Boolean(n)),
    ),
  ];
  // Prefer the backend's primary image, then a color's image, then a
  // constructed scene7 URL from the style + first color code.
  const firstColor = colorList[0];
  const imageUrl =
    p.imageUrl ??
    colorList.find((c) => c.imageUrl)?.imageUrl ??
    scene7Url(p.style, firstColor?.code);
  return {
    id: String(p.id ?? p.style ?? Math.random().toString(36).slice(2)),
    name: String(p.name ?? "Product"),
    brand: "Under Armour",
    price,
    originalPrice,
    currency: p.currency ?? "USD",
    imageUrl,
    productUrl: p.url
      ? p.url.startsWith("http")
        ? p.url
        : `https://www.underarmour.com${p.url}`
      : undefined,
    availability: p.orderable === false ? "Out of stock" : "In stock",
    availableColors: colors,
  };
}

type AgentResponse = {
  answer?: string;
  products?: unknown[];
  suggestions?: RefinementSuggestions;
  filters?: AppliedFilters;
};

/** Keeps only well-formed refinement chips (defensive against shape drift). */
function sanitizeSuggestions(raw: unknown): RefinementSuggestions | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Partial<RefinementSuggestions>;
  const refinements = Array.isArray(s.refinements)
    ? s.refinements.filter(
        (g) => g && Array.isArray(g.values) && g.values.length > 0,
      )
    : [];
  const sorts = Array.isArray(s.sorts) ? s.sorts : [];
  if (refinements.length === 0 && sorts.length === 0) return undefined;
  return { refinements, sorts };
}

async function callBackend(
  prompt: string,
  sessionId?: string,
): Promise<AgentReply | null> {
  const { agentApiBaseUrl } = serverConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    // The agent returns the conversational answer, a structured `products`
    // array, plus `suggestions` (guided-refinement chips) and the accumulated
    // `filters`. Passing a stable sessionId (the conversation id) lets the
    // backend accumulate filters so chip refinements merge deterministically.
    const agentRes = await fetch(`${agentApiBaseUrl}/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sessionId ? { sessionId, prompt } : { prompt }),
      signal: controller.signal,
    });
    if (!agentRes.ok) return null;
    const agentData = (await agentRes.json()) as AgentResponse;

    const products = (Array.isArray(agentData.products) ? agentData.products : [])
      .map(mapBackendProduct)
      .filter((p): p is Product => p !== null);

    const content = (agentData.answer ?? "").trim() || "Here's what I found.";

    return {
      content,
      products,
      suggestions: [
        "Show me more like this",
        "Compare these products",
        "Filter under $100",
      ],
      refinements: sanitizeSuggestions(agentData.suggestions),
      filters: agentData.filters,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Produces an assistant reply for a user prompt. `sessionId` (the conversation
 * id) is forwarded to the backend so guided refinements accumulate filters.
 */
export async function generateReply(
  prompt: string,
  sessionId?: string,
): Promise<AgentReply> {
  const { useMock } = serverConfig();
  if (!useMock) {
    const backend = await callBackend(prompt, sessionId);
    if (backend) return backend;
    // Fall through to mock so the UI stays usable when backend is down.
  }
  return mockAssistantReply(prompt);
}
