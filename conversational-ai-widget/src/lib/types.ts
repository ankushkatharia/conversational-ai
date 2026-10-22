/**
 * Shared domain types for the conversational AI widget.
 * These are the stable, UI-facing shapes, intentionally decoupled from any
 * backend/GraphQL types so the UI does not break when those evolve.
 */

export type OrderItem = {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  fulfillmentStatus: string;
  imageUrl?: string;
};

export type OrderTotals = {
  subtotal: number;
  shipping: number;
  tax: number;
  grandTotal: number;
  discount: number;
};

export type OrderSummary = {
  orderNo: string;
  creationDate: string;
  status: string;
  orderType: string;
  currency: string;
  totals: OrderTotals;
  items: OrderItem[];
};

/** A postal address attached to an order (billing or shipping). */
export type OrderAddress = {
  firstName?: string;
  lastName?: string;
  address1?: string;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
};

/** A single shipment with its carrier tracking details. */
export type OrderShipment = {
  trackingNumber?: string;
  /** Clickable carrier tracking URL, when available. */
  trackingLink?: string;
  /** Fulfillment status for this shipment (e.g. "Fulfilled", "In Progress"). */
  status?: string;
  estimatedDelivery?: string;
  dateShipped?: string;
  dateDelivered?: string;
};

/**
 * Full detail for a single order, including tracking, surfaced by the
 * `get_order_detail_by_order_number` tool / `/order-detail` endpoint.
 */
export type OrderDetail = {
  orderNo: string;
  creationDate: string;
  status: string;
  orderType?: string;
  currency: string;
  totals: OrderTotals;
  shippingAddress?: OrderAddress | null;
  billingAddress?: OrderAddress | null;
  shipments: OrderShipment[];
  items: OrderItem[];
};

/** Help / Queries categories a shopper can pick (kept in sync with backend). */
export type HelpCategory =
  | "order"
  | "payment"
  | "product"
  | "return_refund"
  | "other";

/** How the shopper wants to be helped. */
export type HelpContactMethod = "ticket" | "call";

/**
 * A created support request, surfaced by the `create_support_ticket` tool /
 * `/support-ticket` endpoint.
 */
export type SupportTicket = {
  ref: string;
  category: HelpCategory;
  categoryLabel: string;
  status: string;
  preferredContact: HelpContactMethod;
  description: string;
  orderNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  supportEmail: string;
  createdAt: string;
  /** Whether a real email transport accepted the message (false for log-only). */
  delivered: boolean;
};

/** A tappable option within a "chips" interaction. */
export type InteractionOption = {
  label: string;
  /** Message text sent back to the assistant when this chip is tapped. */
  value: string;
};

/**
 * An inline interactive control the assistant asked the UI to render in the
 * chat transcript (drives the conversational Help / Queries flow). Whatever the
 * shopper taps/types is sent back as their next message.
 */
export type ChatInteraction =
  | { type: "chips"; prompt: string; options: InteractionOption[] }
  | {
      type: "text_input";
      prompt: string;
      inputType?: "email" | "phone" | "text";
      placeholder?: string;
      submitLabel?: string;
    }
  | {
      type: "confirm";
      prompt: string;
      confirmLabel?: string;
      /** Message text sent back when the button is tapped. */
      confirmValue?: string;
    };

/** Payload the widget sends to create a support ticket / contact request. */
export type SupportTicketRequest = {
  category: HelpCategory;
  description: string;
  preferredContact: HelpContactMethod;
  orderNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export type Product = {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  price?: number;
  originalPrice?: number;
  currency?: string;
  imageUrl?: string;
  productUrl?: string;
  availability?: string;
  availableSizes?: string[];
  availableColors?: string[];
  rating?: number;
  reviewCount?: number;
};

export type MessageRole = "user" | "assistant";

export type MessageStatus = "streaming" | "complete" | "error";

/** The exact search arguments a chip applies (merged over current filters). */
export type RefinementDelta = {
  query?: string;
  categoryId?: string;
  limit?: number;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  color?: string;
  gender?: string;
  reset?: boolean;
};

/** One clickable quick-reply value within a facet group. */
export type RefinementValue = {
  label: string;
  count: number;
  selected: boolean;
  delta: RefinementDelta;
};

/** A group of chips for a single facet (Color, Gender, Price). */
export type RefinementGroup = {
  attributeId: string;
  label: string;
  field: "color" | "gender" | "price";
  values: RefinementValue[];
};

/** A clickable sort option. */
export type SortSuggestion = {
  id: string;
  label: string;
  selected: boolean;
  delta: RefinementDelta;
};

/** Dynamic quick-reply chips derived from the live search refinements. */
export type RefinementSuggestions = {
  refinements: RefinementGroup[];
  sorts: SortSuggestion[];
};

/** Structured filters currently applied to the conversation's search. */
export type AppliedFilters = {
  query?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  color?: string;
  gender?: string;
  sort?: string;
  limit?: number;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  products?: Product[];
  /** Structured order summaries surfaced by order-related tool calls. */
  orders?: OrderSummary[];
  /** Full order detail (with tracking) when the user asked about a specific order. */
  orderDetail?: OrderDetail | null;
  /** A support ticket confirmation when one was created in this turn. */
  supportTicket?: SupportTicket | null;
  /** An inline interactive control (chips / input / confirm) for this message. */
  interaction?: ChatInteraction | null;
  suggestions?: string[];
  /** Dynamic guided-refinement chips derived from the latest search. */
  refinements?: RefinementSuggestions;
  /** Structured filters applied to produce this message's results. */
  filters?: AppliedFilters;
  status?: MessageStatus;
  /** Present when status === "error"; a safe, user-facing message. */
  error?: string;
};

/** Response payload for a non-streaming send. */
export type SendMessageResponse = {
  message: ChatMessage;
  products?: Product[];
  orders?: OrderSummary[];
  orderDetail?: OrderDetail | null;
  supportTicket?: SupportTicket | null;
  interaction?: ChatInteraction | null;
  suggestions?: string[];
  refinements?: RefinementSuggestions;
  filters?: AppliedFilters;
};

/** A single Server-Sent-Events style streaming chunk. */
export type ChatStreamEvent =
  | { type: "token"; value: string }
  | { type: "products"; products: Product[] }
  | { type: "orders"; orders: OrderSummary[] }
  | { type: "orderDetail"; orderDetail: OrderDetail }
  | { type: "supportTicket"; supportTicket: SupportTicket }
  | { type: "interaction"; interaction: ChatInteraction }
  | { type: "suggestions"; suggestions: string[] }
  | { type: "refinements"; refinements: RefinementSuggestions }
  | { type: "filters"; filters: AppliedFilters }
  | { type: "done"; messageId: string; createdAt: string }
  | { type: "error"; message: string };

/** Callbacks the host (e.g. Seabiscuit) provides to the widget. */
export type ChatbotWidgetProps = {
  /** Base URL of the MCP server, e.g. 'https://mcp-server.ua.dev'. */
  mcpServerUrl: string;

  /**
   * Called when the AI suggests navigating to an internal route (a path such as
   * '/pdp/123'). The host pushes it through its own router. External absolute
   * URLs open in a new tab regardless.
   */
  onNavigate?: (url: string) => void;

  /**
   * Called when the shopper adds a product to the cart. Optional; cart actions
   * render as disabled placeholders until a handler is supplied.
   */
  onAddToCart?: (productId: string, sku?: string) => void;

  /** Optional class applied to the widget root for host-side positioning. */
  className?: string;

  /** Heading shown in the panel header. Defaults to "Shopping assistant". */
  title?: string;

  /**
   * Display name of the signed-in shopper. When provided, the empty-state
   * greeting personalizes to "Hi {firstName},". Omit for a guest ("Hi there,").
   */
  userName?: string;

  /**
   * URL of the signed-in shopper's profile picture. When provided, it replaces
   * the default icon in the empty-state greeting. Omit for the default.
   */
  userAvatarUrl?: string;

  /**
   * Stable identifier for the signed-in shopper (e.g. customerNo). Used only to
   * scope the browser-persisted chat history per user so it never leaks between
   * accounts. When omitted, `userName` is used; when both are omitted a shared
   * guest bucket is used. On logout/account switch the previous user's history
   * is deleted automatically.
   */
  userId?: string;

  /**
   * Email address of the signed-in shopper (their login id). Used by the
   * Help / Queries flow to pre-fill the ticket email and as the server-side
   * fallback recipient when the shopper does not type one. Omit for guests.
   */
  userEmail?: string;

  /**
   * Supplies the current authentication token for the MCP/UACAPI backend. The
   * host returns whichever token represents the active shopper: a guest token
   * when signed out, or the logged-in token after sign-in. It is called before
   * every request so the widget always sends a fresh, non-expired token (the
   * host can refresh it internally). Return null/undefined to send no
   * `Authorization` header. The widget never stores the token.
   */
  getAuthToken?: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;

  /**
   * Current shopper locale (e.g. "en-us"). Forwarded to the MCP server so
   * UACAPI returns locale-correct catalog, currency, and pricing. Omit to let
   * the server fall back to its configured default.
   */
  locale?: string;
};
