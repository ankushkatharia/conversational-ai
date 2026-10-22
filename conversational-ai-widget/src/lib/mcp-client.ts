/**
 * Browser client that talks to the MCP server (mcp-uacapi) directly.
 *
 * Optionally attaches a host-supplied bearer token (`Authorization`) and locale
 * (`x-ua-locale`) to every request. The backend `POST /agent` endpoint returns a
 * JSON payload ({ answer, products, suggestions, filters }); this client maps it
 * into the UI's stable `Product` shape and simulates token-by-token streaming on
 * the client so the chat UX stays identical to the original BFF-backed experience.
 */

import type {
  AppliedFilters,
  ChatMessage,
  ChatStreamEvent,
  OrderDetail,
  OrderSummary,
  Product,
  RefinementSuggestions,
  SendMessageResponse,
} from "./types";
import { makeId } from "./utils";

const DEFAULT_SUGGESTIONS = [
  "Show me more like this",
  "Compare these products",
  "Filter under $50",
];

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

type AgentResponse = {
  answer?: string;
  products?: unknown[];
  orders?: unknown[];
  orderDetail?: unknown;
  suggestions?: unknown;
  filters?: AppliedFilters;
};

type AgentReply = {
  content: string;
  products: Product[];
  orders: OrderSummary[];
  orderDetail: OrderDetail | null;
  suggestions: string[];
  refinements?: RefinementSuggestions;
  filters?: AppliedFilters;
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

function sanitizeOrders(raw: unknown): OrderSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is OrderSummary => {
    if (!o || typeof o !== "object") return false;
    const order = o as Partial<OrderSummary>;
    return (
      typeof order.orderNo === "string" &&
      typeof order.creationDate === "string" &&
      typeof order.status === "string" &&
      typeof order.currency === "string" &&
      !!order.totals &&
      Array.isArray(order.items)
    );
  });
}

/**
 * Coerces a raw order-detail payload (from the agent or `/order-detail`) into
 * the stable `OrderDetail` shape. Returns null when the order is missing or
 * malformed (e.g. not found / not owned by this customer).
 */
function sanitizeOrderDetail(raw: unknown): OrderDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.orderNo !== "string" || !o.orderNo) return null;

  const num = (v: unknown): number =>
    typeof v === "number" && !Number.isNaN(v) ? v : 0;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v ? v : undefined;

  const totalsRaw = (o.totals ?? {}) as Record<string, unknown>;
  const totals = {
    subtotal: num(totalsRaw.subtotal),
    shipping: num(totalsRaw.shipping),
    tax: num(totalsRaw.tax),
    grandTotal: num(totalsRaw.grandTotal),
    discount: num(totalsRaw.discount),
  };

  const mapAddress = (v: unknown): OrderDetail["shippingAddress"] => {
    if (!v || typeof v !== "object") return null;
    const a = v as Record<string, unknown>;
    return {
      firstName: str(a.firstName),
      lastName: str(a.lastName),
      address1: str(a.address1),
      city: str(a.city),
      stateCode: str(a.stateCode),
      postalCode: str(a.postalCode),
      countryCode: str(a.countryCode),
    };
  };

  const shipments = Array.isArray(o.shipments)
    ? o.shipments
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          trackingNumber: str(s.trackingNumber),
          trackingLink: str(s.trackingLink),
          status: str(s.status),
          estimatedDelivery: str(s.estimatedDelivery),
          dateShipped: str(s.dateShipped),
          dateDelivered: str(s.dateDelivered),
        }))
        .filter((s) => s.trackingNumber || s.trackingLink || s.status)
    : [];

  const items = Array.isArray(o.items)
    ? o.items
        .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
        .map((i) => ({
          name: str(i.name) ?? "Item",
          sku: str(i.sku) ?? "",
          quantity: num(i.quantity),
          price: num(i.price),
          fulfillmentStatus: str(i.fulfillmentStatus) ?? "",
          imageUrl: str(i.imageUrl),
        }))
    : [];

  return {
    orderNo: o.orderNo,
    creationDate: str(o.creationDate) ?? "",
    status: str(o.status) ?? "Unknown",
    orderType: str(o.orderType),
    currency: str(o.currency) ?? "USD",
    totals,
    shippingAddress: mapAddress(o.shippingAddress),
    billingAddress: mapAddress(o.billingAddress),
    shipments,
    items,
  };
}

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

export class McpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "McpError";
    this.status = status;
  }
}

/** Host-supplied hooks that let the widget authenticate and localize requests. */
export type McpClientOptions = {
  /**
   * Returns the active shopper's bearer token (guest or logged-in). Awaited
   * before every request so the token is always fresh. The widget forwards it
   * as `Authorization: Bearer <token>` and never persists it.
   */
  getAuthToken?: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;
  /** Current locale (e.g. "en-us"); forwarded as the `x-ua-locale` header. */
  locale?: string;
};

export class McpClient {
  private readonly baseUrl: string;
  private readonly getAuthToken?: McpClientOptions["getAuthToken"];
  private readonly locale?: string;

  constructor(mcpServerUrl: string, options: McpClientOptions = {}) {
    // Accept either a root URL or one that already ends in `/agent`.
    this.baseUrl = mcpServerUrl
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/(agent|search)$/i, "");
    this.getAuthToken = options.getAuthToken;
    this.locale = options.locale;
  }

  /**
   * Builds the per-request headers, resolving the host's auth token (if any) and
   * attaching the locale. Kept async because `getAuthToken` may refresh a token.
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const token = this.getAuthToken ? await this.getAuthToken() : undefined;
    if (token) headers.authorization = `Bearer ${token}`;
    if (this.locale) headers["x-ua-locale"] = this.locale;
    return headers;
  }

  private async callAgent(
    prompt: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<AgentReply> {
    const res = await fetch(`${this.baseUrl}/agent`, {
      method: "POST",
      headers: await this.buildHeaders(),
      body: JSON.stringify({ sessionId, prompt }),
      signal,
    });
    if (!res.ok) {
      throw new McpError("The assistant is unavailable right now.", res.status);
    }
    const data = (await res.json()) as AgentResponse;
    const products = (Array.isArray(data.products) ? data.products : [])
      .map(mapBackendProduct)
      .filter((p): p is Product => p !== null);
    const orders = sanitizeOrders(data.orders);
    const orderDetail = sanitizeOrderDetail(data.orderDetail);
    const content = (data.answer ?? "").trim() || "Here's what I found.";
    return {
      content,
      products,
      orders,
      orderDetail,
      suggestions: DEFAULT_SUGGESTIONS,
      refinements: sanitizeSuggestions(data.suggestions),
      filters: data.filters,
    };
  }

  /** Sends a message and returns the complete assistant reply (no streaming). */
  async sendMessage(
    sessionId: string,
    message: string,
  ): Promise<SendMessageResponse> {
    const reply = await this.callAgent(message, sessionId);
    const assistantMessage: ChatMessage = {
      id: makeId("msg"),
      role: "assistant",
      content: reply.content,
      createdAt: new Date().toISOString(),
      status: "complete",
      products: reply.products,
      orders: reply.orders,
      orderDetail: reply.orderDetail,
      suggestions: reply.suggestions,
      refinements: reply.refinements,
      filters: reply.filters,
    };
    return {
      message: assistantMessage,
      products: reply.products,
      orders: reply.orders,
      orderDetail: reply.orderDetail,
      suggestions: reply.suggestions,
      refinements: reply.refinements,
      filters: reply.filters,
    };
  }

  /**
   * Fetches full detail (including tracking) for a single order by its order
   * number. Calls the backend `POST /order-detail` endpoint directly (no LLM),
   * so order-tracking clicks are deterministic. Returns null when the order is
   * not found or not owned by the current shopper.
   */
  async getOrderDetail(
    orderNumber: string,
    signal?: AbortSignal,
  ): Promise<OrderDetail | null> {
    const res = await fetch(`${this.baseUrl}/order-detail`, {
      method: "POST",
      headers: await this.buildHeaders(),
      body: JSON.stringify({ orderNumber }),
      signal,
    });
    if (!res.ok) {
      throw new McpError(
        "Could not load tracking for this order right now.",
        res.status,
      );
    }
    const data = (await res.json()) as { order?: unknown };
    return sanitizeOrderDetail(data.order);
  }

  /**
   * Sends a message and invokes `onEvent` for each simulated streaming event.
   * Pass an `AbortSignal` to cancel generation.
   */
  async streamMessage(
    sessionId: string,
    message: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const reply = await this.callAgent(message, sessionId, signal);

    const tokens = reply.content.match(/\S+\s*/g) ?? [reply.content];
    for (const token of tokens) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      onEvent({ type: "token", value: token });
      await new Promise((r) => setTimeout(r, 16));
    }
    if (reply.products.length) {
      onEvent({ type: "products", products: reply.products });
    }
    if (reply.orders.length) {
      onEvent({ type: "orders", orders: reply.orders });
    }
    if (reply.orderDetail) {
      onEvent({ type: "orderDetail", orderDetail: reply.orderDetail });
    }
    if (reply.suggestions.length) {
      onEvent({ type: "suggestions", suggestions: reply.suggestions });
    }
    if (reply.filters) {
      onEvent({ type: "filters", filters: reply.filters });
    }
    if (reply.refinements) {
      onEvent({ type: "refinements", refinements: reply.refinements });
    }
    onEvent({
      type: "done",
      messageId: makeId("msg"),
      createdAt: new Date().toISOString(),
    });
  }
}
