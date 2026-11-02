# Conversational AI Shopping Assistant - Features & Capabilities

Complete reference of every feature implemented in the assistant. Covers the
**widget** (`@ua/conversational-ai-widget`), the **MCP server** (`mcp-uacapi`),
and integration with **Seabiscuit**.

---

## Table of Contents

1.  [System Overview](#1-system-overview)
2.  [Product Search & Discovery](#2-product-search--discovery)
3.  [Product Comparison (AI-Powered)](#3-product-comparison-ai-powered)
4.  [Order History & Tracking](#4-order-history--tracking)
5.  [Help & Support (Ticket Creation)](#5-help--support-ticket-creation)
6.  [Voice Input (Speech-to-Text)](#6-voice-input-speech-to-text)
7.  [Real-Time SSE Streaming](#7-real-time-sse-streaming)
8.  [Dynamic Suggested Prompts](#8-dynamic-suggested-prompts)
9.  [Proactive Welcome Messages](#9-proactive-welcome-messages)
10. [Animated Transitions](#10-animated-transitions)
11. [Personalization](#11-personalization)
12. [Resizable Chat Panel](#12-resizable-chat-panel)
13. [Chat History Persistence](#13-chat-history-persistence)
14. [MCP Tools Reference](#14-mcp-tools-reference)
15. [API Endpoints Reference](#15-api-endpoints-reference)
16. [Widget Props Reference](#16-widget-props-reference)
17. [Architecture Diagram](#17-architecture-diagram)

---

## 1. System Overview

The assistant is an AI-powered shopping companion embedded in the Under Armour
storefront (Seabiscuit). It helps shoppers find products, track orders, compare
items, and get support, all through natural conversation.

**Three projects:**

| Project | Role |
|---|---|
| `conversational-ai-widget` | Embeddable React chat UI (npm package) |
| `mcp-uacapi` | Node backend: HTTP API + LLM agent + MCP tools + UACAPI client |
| Seabiscuit PWA | Host app that mounts the widget |

**Tech stack:**

| Layer | Technology |
|---|---|
| LLM | AWS Bedrock (`openai.gpt-oss-120b`, OpenAI-compatible) |
| Protocol | Model Context Protocol (MCP) over stdio |
| Backend | Node.js (built-in `http`, no framework) |
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Build | tsup (widget), tsc (MCP server) |
| Commerce API | UACAPI (GraphQL) |

---

## 2. Product Search & Discovery

**What it does:** Shoppers search the UA catalog using natural language. The
assistant translates intent into structured API calls and returns real product
cards.

**User experience:**
- Type "show me black running shoes under $100"
- Assistant calls `search_products` with structured filters
- Widget renders a responsive product grid with image, name, price, discount
  badge, colors, sizes, and rating
- Click "View details" to open a product detail drawer
- External link button opens the product page on UA.com

**Search capabilities:**
- Free-text query ("running shoes", "winter jackets")
- Color filter (color groups: Black, Blue, Red, etc.)
- Gender filter (Mens, Womens, Boys, Girls, Unisex)
- Price range (min/max)
- Sort options (top-sellers, now-trending, price-low-high, price-high-low,
  newest, top-rated)
- Category browsing by categoryId

**Refinement system:**
- After search results, dynamic refine chips appear (colors, genders, price
  ranges, sort options) based on live UACAPI refinement data
- Filters accumulate across turns: "running shoes" then "under $100" then
  "only black" keeps all three constraints
- Server-side deterministic filter merge (not LLM memory)
- `reset: true` clears filters for a new product type

**Key files:**

| File | Role |
|---|---|
| `mcp-uacapi/src/tools/searchProducts.ts` | Search tool (zod schema, UACAPI call, stable output) |
| `mcp-uacapi/src/uacapi/searchProducts.ts` | GraphQL query + raw types |
| `widget/src/components/products/ProductCard.tsx` | Product card UI |
| `widget/src/components/products/ProductGrid.tsx` | Responsive product grid |
| `widget/src/components/products/ProductDetailDrawer.tsx` | Product detail drawer |
| `widget/src/components/chat/RefinePanel.tsx` | Refinement chips |
| `widget/src/components/chat/SuggestedPrompts.tsx` | Suggested prompt pills |

---

## 3. Product Comparison (AI-Powered)

**What it does:** Shoppers select 2-4 products from search results and get an
AI-generated side-by-side comparison with key differences, best-for
recommendations, and a verdict.

**User experience:**
1. Search for products (e.g. "show me running shoes")
2. Click the `+` button on each product card image to select for comparison
   (max 4)
3. A floating CompareBar appears above the composer showing selected product
   thumbnails
4. Click "Compare" to open the ComparisonDrawer
5. The drawer shows compact product cards at the top, then an "AI Analysis"
   section loads below with:
   - **Key Differences** (bullet list)
   - **Best For** (who each product suits)
   - **Verdict** (recommendation)

**How the AI analysis works:**
- Widget calls `POST /compare` with product data (name, brand, price, colors,
  availability)
- Server sends product data to the LLM with a structured prompt
- LLM returns markdown analysis (max 250 words, temperature 0.3)
- Widget renders the markdown with react-markdown

**Key files:**

| File | Role |
|---|---|
| `mcp-uacapi/src/http.ts` | `POST /compare` endpoint |
| `widget/src/components/products/ComparisonDrawer.tsx` | Comparison drawer with AI analysis |
| `widget/src/components/products/CompareBar.tsx` | Floating selection bar |
| `widget/src/components/products/ProductCard.tsx` | Compare checkbox overlay on image |
| `widget/src/lib/mcp-client.ts` | `compareProducts()` method |

---

## 4. Order History & Tracking

**What it does:** Logged-in shoppers can view their recent orders and track
shipments with real carrier tracking links.

**User experience:**
- "Show my recent orders" renders an order list with status, items, totals
- Each order card expands (animated) to show item details and price breakdown
- "Track" button fetches real tracking data (carrier, tracking number, link,
  dates)
- "Track another order" text input to enter any order number
- Tracking drawer shows: order status, per-shipment tracking number + clickable
  carrier link + shipped/estimated/delivered dates

**Data flow:**
- `get_orders` fetches via UACAPI `orders()` resolver using the integration
  token
- `get_order_detail_by_order_number` fetches fulfillment groups with shipment
  tracking
- `customerNo` (UUID) identifies the shopper (from `x-ua-customer-no` header)

**Key files:**

| File | Role |
|---|---|
| `mcp-uacapi/src/tools/getOrders.ts` | Order history tool |
| `mcp-uacapi/src/tools/getOrderDetail.ts` | Order detail + tracking tool |
| `widget/src/components/orders/OrderCard.tsx` | Order card with animated expand/collapse |
| `widget/src/components/orders/OrderList.tsx` | Order list container |
| `widget/src/components/orders/OrderTrackingDrawer.tsx` | Full tracking dialog |
| `widget/src/components/orders/OrderTrackingPanel.tsx` | "Track another order" input |
| `widget/src/components/orders/OrderTrackingCard.tsx` | Inline tracking card in chat |

---

## 5. Help & Support (Ticket Creation)

**What it does:** A guided support flow that helps shoppers create tickets or
request call-backs. Two entry points: the in-chat conversational flow (LLM-driven
steps 1-3, then deterministic form) and the standalone Help drawer (lifebuoy
icon).

### In-Chat Flow (LLM + Deterministic Form)

The agent drives the first 3 steps conversationally, then hands off to a
deterministic inline form for ticket creation:

| Step | Driven by | What happens |
|---|---|---|
| 1. Category | LLM (chips) | "Order issue", "Payment issue", "Product issue", "Return/Refund", "Something else" |
| 2. Order selection | LLM (chips) | For order issues only: fetches recent orders, shows as selectable chips |
| 3. Resolution attempt | LLM (chips) | Shows order tracking, asks "Did this resolve your issue?" |
| 4. Ticket creation | **Deterministic form** | Inline form with description + email + submit (no LLM) |

**Why Step 4 is deterministic:** The LLM was unreliable at multi-step data
collection (skipping steps, creating tickets without descriptions, asking for
email after ticket was already created). The solution: when the model calls
`create_support_ticket`, the server intercepts it and emits a `ticket_form`
interaction instead. The widget renders a fixed React form that calls the API
directly.

**Code-level safeguards in `agent.ts`:**
- `create_support_ticket` is always intercepted and replaced with a
  `ticket_form` interaction
- If `request_user_input` and `create_support_ticket` are called in the same
  turn, `create_support_ticket` is skipped
- After `request_user_input` or `create_support_ticket` executes, remaining
  parallel tool calls are skipped

### Help Drawer (Standalone)

Accessed via the lifebuoy icon in the chat header. A fully deterministic guided
wizard:

| Category | Flow |
|---|---|
| Order issue | Category -> Describe + Order number -> Track (optional) -> Contact method -> Submit |
| All others | Category -> Contact method + Describe + Email -> Submit |

- Pre-fills email when the shopper is logged in
- Supports "Email ticket" and "Call me back" contact methods
- Shows confirmation card with reference, topic, description, email

### Ticket Form Card (Inline)

The `TicketFormCard` component renders inline in the chat transcript:
- Description textarea ("Describe your issue")
- Email field (pre-filled and read-only if logged in, editable if guest)
- Submit button
- On submit: calls `POST /support-ticket` directly, shows confirmation with
  reference number, topic, description, and email

**Key files:**

| File | Role |
|---|---|
| `mcp-uacapi/src/tools/supportTicket.ts` | Support ticket tool |
| `mcp-uacapi/src/tools/userInput.ts` | Interactive controls (chips, text_input, confirm, ticket_form) |
| `mcp-uacapi/src/agent.ts` | Intercepts `create_support_ticket`, emits `ticket_form` |
| `widget/src/components/help/HelpDrawer.tsx` | Standalone help wizard |
| `widget/src/components/help/TicketFormCard.tsx` | Inline deterministic ticket form |
| `widget/src/components/help/SupportTicketCard.tsx` | Ticket confirmation card in chat |
| `widget/src/components/chat/ChatInteraction.tsx` | Renders chips, text inputs, confirm buttons |

---

## 6. Voice Input (Speech-to-Text)

**What it does:** Shoppers can speak instead of typing. Uses the browser's Web
Speech API (no server calls).

**User experience:**
- When the message input is empty, a microphone button appears
- Tap to start recording (button pulses red)
- Speak naturally; transcript fills the input field in real-time
- Tap again to stop; the transcript is ready to send
- When typing, the mic button hides and the send button appears

**Browser support:** Works in Chrome, Edge, Safari. Gracefully hidden when the
browser does not support `webkitSpeechRecognition` or `SpeechRecognition`.

**Key files:**

| File | Role |
|---|---|
| `widget/src/hooks/useVoiceInput.ts` | Web Speech API hook (toggle, state, transcript) |
| `widget/src/components/chat/MessageComposer.tsx` | Mic button + pulse animation |
| `widget/src/styles/widget.css` | `ua-mic-pulse` keyframe animation |

---

## 7. Real-Time SSE Streaming

**What it does:** The assistant streams its response token-by-token and sends
structured data (products, orders, interactions) as soon as each tool completes,
rather than waiting for the full response.

**How it works:**

```
Widget: POST /agent/stream (Accept: text/event-stream)
Server: text/event-stream response
  -> event: status    data: { message: "Thinking..." }
  -> event: status    data: { message: "Searching products..." }
  -> event: products  data: { products: [...] }         // as soon as tool completes
  -> event: token     data: { value: "Here" }
  -> event: token     data: { value: " are" }            // 18ms delay between tokens
  -> event: token     data: { value: " some" }
  -> event: suggestions data: { ... }
  -> event: done      data: { messageId, createdAt }
```

**Key features:**
- Products/orders/interactions stream immediately when each tool completes
  (via `onProgress` callbacks in the agent)
- 18ms delay between token writes for a natural typing effect
- De-duplication tracking: data sent via `onProgress` is not re-sent after the
  agent finishes
- Graceful fallback: if `/agent/stream` returns non-200, falls back to the
  non-streaming `/agent` endpoint with client-side fake streaming

**Key files:**

| File | Role |
|---|---|
| `mcp-uacapi/src/http.ts` | `POST /agent/stream` SSE endpoint |
| `mcp-uacapi/src/agent.ts` | `AgentProgressEvent` type, `onProgress` callbacks |
| `widget/src/lib/mcp-client.ts` | `streamMessage()` SSE consumer with ReadableStream |

---

## 8. Dynamic Suggested Prompts

**What it does:** Instead of hardcoded suggestions, the widget generates
context-aware prompts from the latest search results.

**Examples:**
- After searching "shoes": "Show Black only", "Under $50", "Mens only",
  "Sort by best sellers"
- Generated from live UACAPI refinement data (colors, genders, price ranges,
  sort options)

**How it works:**
- `buildSuggestions()` in `mcp-client.ts` generates prompts from refinement
  groups
- Picks the most popular unselected value from each refinement group (color,
  gender, price)
- Adds trending/best-seller sort if not already selected
- Limited to 4 suggestions
- Updated on both streaming and non-streaming paths

**Key files:**

| File | Role |
|---|---|
| `widget/src/lib/mcp-client.ts` | `buildSuggestions()` function |
| `widget/src/components/chat/SuggestedPrompts.tsx` | Pill-style suggestion buttons |

---

## 9. Proactive Welcome Messages

**What it does:** Context-aware greetings based on time of day, returning user
detection, and page context.

**Three signals:**

| Signal | Detection | Example |
|---|---|---|
| Time of day | `new Date().getHours()` | "Good morning", "Good afternoon", "Good evening" |
| Returning user | `localStorage` key `ua-cai-last-visit` | "Welcome back, Ankush!" vs first-visit greeting |
| Page context | `pageContext` prop from host | "I see you're looking at UA HOVR Phantom 3. Need help with sizing?" |

**Page context types:**

| `pageType` | Subtitle | Quick actions |
|---|---|---|
| `pdp` | "I see you're looking at {product}..." | Size guide, Find similar |
| `plp` | "Browsing {category}? I can help..." | Filter products |
| `cart` | "You have N items in your cart..." | Check availability |
| `order` | "Need to track an order?" | Track my order |
| `home` / none | Generic greeting | Default actions |

Quick actions are contextual: PDP shows "Size guide" and "Find similar", PLP
shows "Filter {category}", with remaining slots filled by defaults (search,
recommendations, size, track order).

**Key files:**

| File | Role |
|---|---|
| `widget/src/components/chat/ChatEmptyState.tsx` | Greeting + contextual quick actions |
| `widget/src/lib/types.ts` | `pageContext` prop definition |

---

## 10. Animated Transitions

**What it does:** Smooth CSS animations for a polished feel.

| Animation | Where | Technique |
|---|---|---|
| Message entrance | Each chat message | Slide up 8px + fade in (250ms, spring ease) |
| Order card expand/collapse | Order detail section | CSS `grid-template-rows: 0fr -> 1fr` (250ms) |
| Drawer open | Backdrop + panel | Backdrop fade (200ms) + panel slide up + scale (280ms) |
| Drawer close | Backdrop + panel | Reverse animations (200ms) before DOM removal |
| Typing indicator | Pending message | Same slide-up entrance as messages |
| Mic pulse | Voice recording | Red ring pulse animation |

All animations use `cubic-bezier(0.22, 1, 0.36, 1)` (spring) for entrances and
`cubic-bezier(0.4, 0, 1, 1)` for exits.

**Key files:**

| File | Role |
|---|---|
| `widget/src/styles/widget.css` | All `@keyframes` and animation classes |
| `widget/src/components/ui/Drawer.tsx` | Enter/exit transition state machine |
| `widget/src/components/orders/OrderCard.tsx` | Grid-rows expand/collapse |
| `widget/src/components/chat/ChatMessageList.tsx` | `.ua-cai-msg-in` on messages |

---

## 11. Personalization

**What it does:** Uses the signed-in shopper's name and profile picture
throughout the widget.

| Feature | Prop | Effect |
|---|---|---|
| Greeting | `userName` | "Hi Ankush," instead of "Hi there," |
| Avatar | `userAvatarUrl` | Profile picture in empty state (replaces sparkle icon) |
| Bot icon | (built-in) | `Bot` icon from lucide-react replaces "UA" text |
| Pre-filled email | `userEmail` | Support ticket form auto-fills email |

---

## 12. Resizable Chat Panel

**What it does:** On desktop, the chat panel can be resized by dragging edges.

- Left edge: resize width
- Top edge: resize height
- Top-left corner: resize both
- Expand/collapse button: toggles between current size and max viewport size
- Size persists in `localStorage` (`ua-cai-panel-size`)
- Minimum size: 360x460px
- Respects viewport margins (48px horizontal, 120px vertical)
- On mobile: full-width bottom sheet (88vh), no resize

---

## 13. Chat History Persistence

**What it does:** Chat history is saved in the browser and restored when the
shopper returns.

- Stored in `localStorage`, scoped by user key (`userId` or `userName`)
- On login/logout/account switch, the previous user's history is cleared
- Server-side session memory (history + filters) is in-process only, bounded to
  20 turns and 500 sessions

---

## 14. MCP Tools Reference

All tools are read-only. The LLM cannot write to UACAPI.

| Tool | Purpose | Model-facing input | Auth |
|---|---|---|---|
| `search_products` | Product catalog search | `query`, `categoryId`, `limit`, `sort`, `minPrice`, `maxPrice`, `color`, `gender`, `reset` | Shopper token |
| `get_orders` | Order history | `limit` | Integration token + customerNo |
| `get_order_detail_by_order_number` | Order detail + tracking | `orderNumber` | Integration token + customerNo |
| `create_support_ticket` | Create support ticket (intercepted, renders form) | `category`, `description`, `preferredContact`, `contactEmail`/`contactPhone` | userEmail from headers |
| `request_user_input` | Render inline interactive controls | `type` (chips/text_input/confirm), `prompt`, `options`, etc. | N/A |

---

## 15. API Endpoints Reference

All endpoints are on the MCP server (`mcp-uacapi`).

| Method | Path | Purpose | LLM involved? |
|---|---|---|---|
| `GET` | `/health` | Liveness check | No |
| `POST` | `/agent` | Full LLM + tools (non-streaming) | Yes |
| `POST` | `/agent/stream` | Full LLM + tools (SSE streaming) | Yes |
| `POST` | `/search` | Direct product search (no LLM) | No |
| `POST` | `/orders` | Direct order history (no LLM) | No |
| `POST` | `/order-detail` | Direct order detail + tracking (no LLM) | No |
| `POST` | `/support-ticket` | Direct ticket creation (no LLM) | No |
| `POST` | `/compare` | LLM-powered product comparison | Yes (analysis only) |

**Common headers:**

| Header | Purpose |
|---|---|
| `Authorization: Bearer <token>` | Shopper's UACAPI token (guest or registered) |
| `x-ua-locale: en-us` | Language + site (split into `ua-language-code` + `ua-site-code`) |
| `x-ua-customer-no: <UUID>` | Shopper identity for order lookups |
| `x-ua-user-email: <email>` | Shopper email for ticket pre-fill |

---

## 16. Widget Props Reference

```tsx
<ChatbotWidget
  mcpServerUrl="https://mcp-server.ua.dev"
  getAuthToken={() => shopperBearerToken}
  locale="en-us"
  userName="Ankush Katharia"
  userAvatarUrl="https://..."
  userId="cust-12345"
  userEmail="ankush@ua.com"
  title="Shopping assistant"
  onNavigate={(url) => router.push(url)}
  onAddToCart={(productId, sku) => cart.add(productId, sku)}
  pageContext={{
    pageType: "pdp",
    productName: "UA HOVR Phantom 3",
    categoryName: "Running Shoes",
    cartItemCount: 2,
  }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `mcpServerUrl` | `string` | Yes | MCP server base URL |
| `getAuthToken` | `() => string \| Promise<string>` | No | Returns the shopper's UACAPI bearer token |
| `locale` | `string` | No | e.g. "en-us", forwarded as `x-ua-locale` |
| `userName` | `string` | No | Personalizes the greeting |
| `userAvatarUrl` | `string` | No | Profile picture in empty state |
| `userId` | `string` | No | Scopes persisted chat history per user |
| `userEmail` | `string` | No | Pre-fills support ticket email |
| `title` | `string` | No | Panel header text (default "Shopping assistant") |
| `onNavigate` | `(url: string) => void` | No | Host routing callback |
| `onAddToCart` | `(productId: string, sku?: string) => void` | No | Host cart callback |
| `pageContext` | `object` | No | Page awareness for greetings/actions |
| `className` | `string` | No | CSS class on the widget root |

---

## 17. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  SEABISCUIT (Host PWA)                                          │
│                                                                  │
│  <ChatbotWidget mcpServerUrl="..." getAuthToken={...} />       │
│                                                                  │
│  ┌──────────── conversational-ai-widget ─────────────────┐     │
│  │                                                        │     │
│  │  ChatPanel                                             │     │
│  │  ├── ChatMessageList                                   │     │
│  │  │   ├── ChatMessage (text, products, orders, forms)  │     │
│  │  │   ├── ProductGrid + ProductCard (compare checkbox) │     │
│  │  │   ├── OrderList + OrderCard (animated expand)      │     │
│  │  │   ├── TicketFormCard (deterministic form)          │     │
│  │  │   ├── ChatInteraction (chips, text_input, confirm) │     │
│  │  │   └── SuggestedPrompts + RefinePanel               │     │
│  │  ├── CompareBar (floating selection)                   │     │
│  │  ├── MessageComposer (text + voice input)             │     │
│  │  ├── ProductDetailDrawer                               │     │
│  │  ├── OrderTrackingDrawer                               │     │
│  │  ├── ComparisonDrawer (AI analysis)                   │     │
│  │  └── HelpDrawer (standalone wizard)                   │     │
│  │                                                        │     │
│  │  McpClient (mcp-client.ts)                            │     │
│  │  ├── streamMessage() -> POST /agent/stream (SSE)      │     │
│  │  ├── getOrderDetail() -> POST /order-detail           │     │
│  │  ├── createSupportTicket() -> POST /support-ticket    │     │
│  │  └── compareProducts() -> POST /compare               │     │
│  └────────────────────────┬───────────────────────────────┘     │
└────────────────────────────┼─────────────────────────────────────┘
                              │  HTTPS (JSON + SSE)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  mcp-uacapi (Node backend)                                      │
│                                                                  │
│  HTTP Layer (http.ts)                                           │
│  ├── GET  /health                                                │
│  ├── POST /agent           (LLM + tools, non-streaming)         │
│  ├── POST /agent/stream    (LLM + tools, SSE streaming)         │
│  ├── POST /search          (direct tool, no LLM)                │
│  ├── POST /orders          (direct tool, no LLM)                │
│  ├── POST /order-detail    (direct tool, no LLM)                │
│  ├── POST /support-ticket  (direct tool, no LLM)                │
│  └── POST /compare         (LLM analysis, no tools)             │
│                                                                  │
│  Agent Layer (agent.ts)                                         │
│  ├── LLM: AWS Bedrock (openai.gpt-oss-120b)                    │
│  ├── System prompt (product search, orders, support flow)       │
│  ├── Tool-calling loop (max 8 turns, max 3 tool calls)          │
│  ├── Deterministic filter merge (per sessionId)                 │
│  ├── create_support_ticket interception -> ticket_form          │
│  ├── SSE progress events (onProgress callbacks)                 │
│  └── Auth injection at tool-call boundary only                  │
│                                                                  │
│  MCP Server (index.ts) - stdio transport                        │
│  ├── search_products (read-only)                                 │
│  ├── get_orders (read-only)                                      │
│  ├── get_order_detail_by_order_number (read-only)               │
│  ├── create_support_ticket (read-only)                           │
│  └── request_user_input (UI controls)                            │
│                                                                  │
│  UACAPI Client (uacapi/client.ts)                               │
│  └── GraphQL POST { query, variables } (no string interpolation)│
└──────────────────────────┬──────────────────────────────────────┘
                            │  HTTPS GraphQL
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  UACAPI (Under Armour Commerce API)                             │
│  ├── search(...)  -> catalog, pricing, images, refinements      │
│  ├── orders(...)  -> order history + tracking (integration token)│
│  └── viewer       -> customer identity                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Design

| Principle | Implementation |
|---|---|
| Read-only tools | All MCP tools are annotated `readOnlyHint: true` |
| No injection | GraphQL variables only, never string interpolation |
| Credential isolation | Shopper token for search, integration token for orders |
| Token never reaches LLM | Auth injected only at the tool-call boundary |
| Integration token never reaches browser | Lives only in server environment |
| Bounded sessions | Max 20 turns, 500 sessions, trimmed assistant content |
| Deterministic ticket creation | LLM cannot create tickets, only trigger the form |
