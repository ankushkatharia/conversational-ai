# Conversational AI Shopping Assistant - Architecture

End-to-end design of the shopping assistant: the **widget** embedded in
**Seabiscuit**, the **mcp-uacapi** service (API + agent + MCP tools), and
**UACAPI** (Under Armour Commerce API).

---

## 1. High-level diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SEABISCUIT (host web app)                                                      │
│                                                                                │
│   <ChatbotWidget                                                               │
│      mcpServerUrl = "https://mcp-uacapi/..."                                   │
│      getAuthToken = () => shopperBearerToken   (guest or registered)          │
│      locale       = "en-us" | "en-ca" />                                       │
│                                                                                │
│   ┌────────────────────────── conversational-ai-widget ──────────────────┐    │
│   │ UI: ChatPanel, ChatMessageList, ProductGrid/Card, OrderList,          │    │
│   │     ProductDetail dialog, RefinePanel, SuggestedPrompts               │    │
│   │ Client: McpClient (lib/mcp-client.ts)                                 │    │
│   │   - buildHeaders(): Authorization: Bearer <token>, x-ua-locale        │    │
│   │   - callAgent(): POST /agent, maps response -> Product/OrderSummary   │    │
│   │   - simulates token streaming on the client                          │    │
│   └───────────────────────────────┬───────────────────────────────────────┘    │
└───────────────────────────────────┼────────────────────────────────────────┘
                                     │  HTTPS JSON
                                     │  POST /agent { sessionId, prompt }
                                     │  Headers: Authorization, x-ua-locale,
                                     │           x-ua-customer-no
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ mcp-uacapi (Node service)                                                      │
│                                                                                │
│  A) HTTP API layer  (src/http.ts)                                              │
│     GET  /health                                                               │
│     POST /agent    -> LLM + tools (session memory)                            │
│     POST /search   -> search_products tool only (no LLM)                      │
│     POST /orders   -> get_orders tool only (no LLM)                           │
│     parseAuthContext(): Authorization -> bearerToken                           │
│                         x-ua-locale   -> siteCode (US/CA) + languageCode       │
│                         x-ua-customer-no -> customerNo                         │
│                                   │                                            │
│  B) Agent layer  (src/agent.ts)   │                                            │
│     - Model: AWS Bedrock (OpenAI-compatible), openai.gpt-oss-120b             │
│     - System prompt + tool-calling loop (<= 3 tool calls/turn)               │
│     - Accumulates/merges search filters across turns (per sessionId)         │
│     - Injects auth (token/site/customerNo) into tool calls (NOT model-facing) │
│                                   │ spawns + lists tools (stdio)               │
│  C) MCP server  (src/index.ts)    ▼                                            │
│     McpServer over StdioServerTransport registers tools:                      │
│        • search_products   (read-only)                                         │
│        • get_orders        (read-only)                                         │
│                                   │                                            │
│  D) Tools layer  (src/tools/*)    ▼                                            │
│     - zod input schema + validation                                           │
│     - raw GraphQL -> stable output model mapping                              │
│       searchProducts.ts  -> SearchProductsResult (products, suggestions)      │
│       getOrders.ts       -> GetOrdersResult (orders, items, totals, imageUrl) │
│                                   │                                            │
│  E) UACAPI client  (src/uacapi/client.ts)                                      │
│     - GraphQL POST { query, variables } (no string interpolation)            │
│     - Context headers: ua-site-code, ua-language-code, uaclienttype          │
│     - Auth: shopper token (search) / UACAPI_INTEGRATION_TOKEN (orders)        │
│       operations: uacapi/searchProducts.ts (McpSearchProducts)               │
│                   uacapi/getOrders.ts       (McpGetOrders)                    │
└───────────────────────────────────┼────────────────────────────────────────┘
                                     │  HTTPS GraphQL
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ UACAPI  (Under Armour Commerce API, GraphQL)                                   │
│   search(...)  -> product catalog, pricing, images, refinements               │
│   orders(...)  -> order history (graphql-shield: INTEGRATION token required)   │
│   viewer       -> customer identity                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Components and responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| Host | Seabiscuit | Embeds `<ChatbotWidget>`, supplies `mcpServerUrl`, `getAuthToken()`, `locale`. |
| Widget UI | `conversational-ai-widget/src/components` | Renders chat, product cards/grid, order list, product-detail dialog, refine/suggestions. |
| Widget client | `conversational-ai-widget/src/lib/mcp-client.ts` | Adds auth + locale headers, calls `POST /agent`, maps backend JSON to UI models, simulates streaming. |
| HTTP API | `mcp-uacapi/src/http.ts` | Routes `/agent`, `/search`, `/orders`, `/health`; parses auth/locale/customerNo; in-memory sessions. |
| Agent | `mcp-uacapi/src/agent.ts` | LLM tool-calling loop (Bedrock gpt-oss), filter accumulation, injects auth into tool calls. |
| MCP server | `mcp-uacapi/src/index.ts` | Registers read-only tools over stdio. |
| Tools | `mcp-uacapi/src/tools/*` | Input validation (zod) + stable output mapping. |
| UACAPI client | `mcp-uacapi/src/uacapi/client.ts` | GraphQL transport, context headers, token selection. |
| GraphQL ops | `mcp-uacapi/src/uacapi/*.ts` | Static query documents + raw response types. |
| Commerce API | UACAPI | Source of truth for catalog, pricing, orders. |

---

## 3. Tools (MCP, read-only)

### `search_products`
- Input (model-facing): `query`, `categoryId`, `limit` (default 20), `sort`,
  `minPrice`, `maxPrice`, `color`, `gender`, `reset`.
- Injected (server): `auth { bearerToken, siteCode, languageCode }`.
- UACAPI op: `McpSearchProducts` -> `search(...)`.
- Output: `{ totalCount, count, pageInfo, products[], suggestions }`.
- Auth: the shopper's bearer token (guest or registered) for shopper-correct results.

### `get_orders`
- Input (model-facing): `limit` (default 3).
- Injected (server): `auth { siteCode, languageCode, customerNo }`.
- UACAPI op: `McpGetOrders` -> `orders(input: { siteId, customerNo })`.
- Output: `{ totalCount, count, orders[] }` where each order has
  `totals { subtotal, shipping, tax, grandTotal, discount }` and
  `items[] { name, sku, quantity, price, fulfillmentStatus, imageUrl }`.
- Auth: **integration token** (`UACAPI_INTEGRATION_TOKEN`) because the `orders`
  resolver is shield-gated to machine tokens; `customerNo` must be the UUID
  identity id (from the shopper token `sub.customerNo`).

---

## 4. API layers (wire contracts)

### Widget -> mcp-uacapi
```
POST /agent
Headers:
  Authorization: Bearer <shopper token>     (guest or registered)
  x-ua-locale: en-us | en-ca                 -> siteId US/CA + language
  x-ua-customer-no: <UUID customerNo>        (for order lookups)
Body: { "sessionId": "<conversation id>", "prompt": "<user message>" }

Response: { answer, products[], orders[], suggestions, filters }
```

Direct (no-LLM) endpoints for testing/integration:
```
POST /search  { query?, categoryId?, limit?, sort?, minPrice?, maxPrice?, color?, gender? }
POST /orders  { limit?, customerNo?, siteId? }
```

### mcp-uacapi -> UACAPI
```
POST /graphql   { query: <static document>, variables: {...} }
Headers: authorization, ua-site-code, ua-language-code, uaclienttype
```

---

## 5. Models

### UI models (`conversational-ai-widget/src/lib/types.ts`)
- `Product` - id, name, brand, price/originalPrice, currency, imageUrl, productUrl,
  availability, availableColors/Sizes, rating.
- `OrderSummary` - orderNo, creationDate, status, currency, totals, items[].
- `RefinementSuggestions`, `AppliedFilters`, `ChatMessage`, `ChatStreamEvent`.

### Tool I/O models (`mcp-uacapi/src/tools/*`)
- `SearchProductsInput` / `SearchProductsResult` (+ `Product`, `SearchSuggestions`).
- `GetOrdersInput` / `GetOrdersResult` (+ `Order`, `OrderItem`, `OrderTotals`).

### LLM model
- `openai.gpt-oss-120b` served via AWS Bedrock (OpenAI-compatible endpoint,
  `OPENAI_BASE_URL`), accessed by the agent as function-calling tools.

---

## 6. Auth & locale flow (important)

| Concern | Source | Used for |
|---|---|---|
| Shopper token | Host `getAuthToken()` -> `Authorization` header | `search_products` (shopper-correct catalog/pricing). |
| Integration token | `UACAPI_INTEGRATION_TOKEN` (server env) | `get_orders` (shield-gated back-office `orders` query). |
| customerNo (UUID) | `x-ua-customer-no` header | `orders(input.customerNo)`; must match the shopper's identity. |
| Locale | `x-ua-locale` (e.g. en-us) | `siteId` US/CA + `ua-language-code`; localizes results/pricing. |

The shopper token is **never** sent to the LLM and **never** used for `orders`;
the integration token is **never** exposed to the browser.

---

## 7. Request sequences

### Product search ("show me black running shoes under $100")
```
Widget -> POST /agent (shopper token, locale)
mcp-uacapi: agent -> LLM decides search_products({ query, color, maxPrice })
          -> MCP tool -> UACAPI search(...) with shopper token + locale headers
          <- products + refinements
Widget: renders ProductGrid + RefinePanel; "View details" opens the dialog.
```

### Order history ("show my last 3 orders")
```
Widget -> POST /agent (shopper token, locale, x-ua-customer-no)
mcp-uacapi: agent -> LLM decides get_orders({ limit: 3 })
          -> MCP tool -> UACAPI orders(input:{ siteId, customerNo })
                          using UACAPI_INTEGRATION_TOKEN
          <- orders (totals, items, imageUrl)
Widget: renders OrderList (refine/suggestions hidden for orders).
```

---

## 8. Key design choices
- **MCP tools are read-only** and vetted; the LLM cannot hit UACAPI directly.
- **GraphQL variables only** (no string interpolation) -> no injection, cached plans.
- **Stable output models** decouple the UI from UACAPI schema drift.
- **Deterministic filter accumulation** server-side (per `sessionId`) so chip
  refinements merge reliably instead of relying on the model's memory.
- **Separation of credentials**: shopper token (search) vs integration token (orders).
```
