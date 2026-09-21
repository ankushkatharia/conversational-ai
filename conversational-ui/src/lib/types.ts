/**
 * Shared domain types for the Under Armour Shopping Assistant.
 * These are the stable, UI-facing shapes. They are intentionally decoupled
 * from any backend/GraphQL types so the UI does not break when those evolve.
 */

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
  suggestions?: string[];
  /** Dynamic guided-refinement chips derived from the latest search. */
  refinements?: RefinementSuggestions;
  /** Structured filters applied to produce this message's results. */
  filters?: AppliedFilters;
  status?: MessageStatus;
  /** Present when status === "error"; a safe, user-facing message. */
  error?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Short preview of the last message, for the sidebar list. */
  preview?: string;
  messages?: ChatMessage[];
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type AuthSession = {
  user: User;
  /** Opaque token. In cookie-based mode this is not exposed to JS. */
  accessToken?: string;
};

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
};

/** Response payload for POST /conversations/:id/messages. */
export type SendMessageResponse = {
  message: ChatMessage;
  products?: Product[];
  suggestions?: string[];
  refinements?: RefinementSuggestions;
  filters?: AppliedFilters;
};

/** A single Server-Sent-Events style streaming chunk from the BFF. */
export type ChatStreamEvent =
  | { type: "token"; value: string }
  | { type: "products"; products: Product[] }
  | { type: "suggestions"; suggestions: string[] }
  | { type: "refinements"; refinements: RefinementSuggestions }
  | { type: "filters"; filters: AppliedFilters }
  | { type: "done"; messageId: string; createdAt: string }
  | { type: "error"; message: string };
