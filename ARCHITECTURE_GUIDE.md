# Conversational AI Shopping Assistant — Detailed Guide

A complete, plain-language walkthrough of how the system works end to end: the
**widget** embedded in **Seabiscuit**, the **mcp-uacapi** service, and
**UACAPI**. This is the companion explainer to `ARCHITECTURE.md` (which holds
the quick-reference diagram and tables). Read this top to bottom to understand
every layer, tool, model, and decision.

![Architecture diagram](/Users/ankush.katharia/.factory/generated-images/generated-1792135190121-091c94df.png)

---

## Table of contents
1. [What this system does](#1-what-this-system-does)
2. [Glossary](#2-glossary)
3. [The three projects](#3-the-three-projects)
4. [End-to-end request lifecycle](#4-end-to-end-request-lifecycle)
5. [mcp-uacapi layer by layer](#5-mcp-uacapi-layer-by-layer)
6. [The MCP tools in detail](#6-the-mcp-tools-in-detail)
7. [Data models](#7-data-models)
8. [Authentication and locale](#8-authentication-and-locale)
9. [Sessions and filter memory](#9-sessions-and-filter-memory)
10. [Configuration (environment variables)](#10-configuration-environment-variables)
11. [Error handling and debugging](#11-error-handling-and-debugging)
12. [Security design choices](#12-security-design-choices)
13. [How to run and test](#13-how-to-run-and-test)

---

## 1. What this system does

It is an AI shopping assistant embedded in Under Armour's storefront
(Seabiscuit). A shopper types a natural-language message such as *"show me black
running shoes under $100"* or *"what were my last 3 orders?"*. The assistant:

- Understands the intent with a large language model (LLM).
- Calls safe, read-only **tools** to fetch real data from UACAPI (the commerce
  backend) — it never invents products, prices, or orders.
- Returns a short conversational sentence plus **structured data** (product
  cards, order cards) that the UI renders itself.

The key idea: the LLM decides *what* to fetch, but a controlled server decides
*how* to fetch it. The model never talks to the commerce API directly and never
sees shopper credentials.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Seabiscuit** | The host storefront web app that embeds the chat widget. |
| **Widget** | The embeddable React chat UI (`conversational-ai-widget`). |
| **mcp-uacapi** | The Node backend: HTTP API + LLM agent + MCP tools + UACAPI client. |
| **UACAPI** | Under Armour Commerce API (GraphQL) — source of truth for catalog and orders. |
| **MCP** | Model Context Protocol — a standard way to expose "tools" to an LLM. Here the tools run in a child process the agent talks to over stdio. |
| **Tool** | A single, well-defined action the model may invoke (e.g. `search_products`). Read-only here. |
| **Agent** | The loop that sends the prompt to the model, runs any tool calls it requests, and returns the final answer. |
| **Shopper token** | The signed-in or guest shopper's bearer token (JWT). |
| **Integration token** | A machine/back-office token required for the `orders` query. |
| **Locale** | Language + site, e.g. `en-us` → language `en`, site `US`. |
| **Session** | A conversation thread keyed by `sessionId`, with remembered history + filters. |

---

## 3. The three projects

The repo (`conversational-ai`) is a monorepo with three subprojects:

### 3.1 `conversational-ai-widget` (the embeddable widget)
A self-contained React widget that Seabiscuit drops onto any page. It renders
the chat, product cards, order cards, the product-detail dialog, refine chips,
and suggested prompts. It talks to `mcp-uacapi` over plain HTTPS/JSON.

The host mounts it like this (props from `src/lib/types.ts`):

```tsx
<ChatbotWidget
  mcpServerUrl="https://<mcp-uacapi host>"   // where the backend lives
  getAuthToken={() => shopperBearerToken}     // guest or logged-in token (async OK)
  locale="en-us"                              // becomes site + language
/>
```

`ChatbotWidget.tsx` creates one `McpClient` from those props and memoizes it.

### 3.2 `mcp-uacapi` (the backend brain)
A small Node service (no web framework — just the built-in `http` module) that:
- exposes HTTP endpoints for the widget,
- runs the LLM agent and its tool-calling loop,
- hosts the MCP tool server,
- and calls UACAPI over GraphQL.

### 3.3 `conversational-ui` (full-page reference app)
A Next.js app that mirrors the widget's components for standalone development
and testing. The same UI fixes are usually applied to both. The widget is what
Seabiscuit actually ships.

---

## 4. End-to-end request lifecycle

Here is exactly what happens for one message, step by step.

```
1. Shopper types a message in the widget.
2. Widget McpClient.buildHeaders() resolves getAuthToken() and locale, then
   POSTs to {mcpServerUrl}/agent:
       body:    { sessionId, prompt }
       headers: Authorization: Bearer <shopper token>
                x-ua-locale: en-us
                x-ua-customer-no: <UUID>     (if available)
3. mcp-uacapi http.ts:
     - parseAuthContext() turns the headers into { bearerToken, siteCode,
       languageCode, customerNo }.
     - Looks up the session by sessionId and loads prior turns + saved filters.
     - Calls agent.runAgent(prompt, history, filters, authContext).
4. agent.ts:
     - Builds the message list: system prompt + prior turns + this prompt.
     - Calls the LLM (gpt-oss-120b on AWS Bedrock) with the tool definitions.
     - The model replies with either text (done) or one/more tool calls.
     - For each tool call: merge filters (search only), inject auth at the call
       boundary, run the tool via the MCP client, feed the JSON result back.
     - Repeats until the model gives a final text answer or hits the tool-call cap.
5. The tool (search_products / get_orders):
     - Validates input with zod.
     - Builds GraphQL variables and calls the UACAPI client.
     - Maps the raw GraphQL response into a stable output shape.
6. UACAPI client:
     - POSTs { query, variables } with the right token + context headers.
     - Returns data or throws a descriptive error.
7. agent.ts collects the structured products/orders/suggestions and the final
   sentence, and returns { answer, products, orders, suggestions, filters }.
8. http.ts saves the updated session (history + filters) and responds with JSON.
9. Widget maps the JSON into UI models and simulates token-by-token streaming,
   then renders the sentence + product/order cards.
```

---

## 5. mcp-uacapi layer by layer

The backend is deliberately split into small layers, each with one job. Files
are under `mcp-uacapi/src/`.

### 5.1 HTTP API layer — `http.ts`
The only network entry point. Built on Node's `http` module (no Express).

Endpoints:
- `GET /health` → `{ status: "ok" }` for liveness checks.
- `POST /agent` → the full LLM + tools flow. Accepts three body shapes:
  - `{ prompt }` — single message (uses a shared default session).
  - `{ sessionId, prompt }` — server remembers this thread (recommended; the widget uses this).
  - `{ messages: [{role, content}, ...] }` — client-managed history.
- `POST /search` → runs `search_products` directly, no LLM (handy for Postman).
- `POST /orders` → runs `get_orders` directly, no LLM.

Responsibilities:
- **`parseAuthContext(req)`** reads request headers into a `RequestAuthContext`:
  - `Authorization: Bearer <token>` → `bearerToken` (scheme stripped).
  - `x-ua-locale` (e.g. `en-us`) → `languageCode` (`en`) + `siteCode` (`US`).
    Explicit `x-ua-language-code` / `x-ua-site-code` win if present.
  - `x-ua-customer-no` → `customerNo` (for order lookups).
  - Returns `undefined` if nothing is present, so the server falls back to its
    static startup config (useful for no-auth testing).
- **Session store**: an in-memory `Map` keyed by `sessionId`, holding `history`
  (chat turns) and `filters` (accumulated search filters). Bounded by
  `SESSION_MAX_TURNS = 20` and `MAX_SESSIONS = 500`. **No database** — state is
  lost on restart and not shared across instances. Fine for dev/single instance;
  production would swap in a shared store.
- Request body parsing, JSON responses, and centralized error handling.

### 5.2 Agent layer — `agent.ts`
Connects the model to the tools and runs the loop.

- **Model**: OpenAI-compatible client pointed at AWS Bedrock. Default model
  `openai.gpt-oss-120b` (override via `OPENAI_MODEL`). Credentials come from
  `OPENAI_API_KEY` + `OPENAI_BASE_URL`, re-read from `.env` on each run so an
  expired Bedrock token can be refreshed without restarting the server.
- **Startup**: `createAgent()` spawns the MCP server (`dist/index.js`) over
  stdio, lists its tools, and converts them into OpenAI "function" tools with
  `toOpenAITools()`. One connected agent is shared across all HTTP requests.
- **The loop** (`runAgent`): up to `MAX_TURNS = 8` model round-trips, but at most
  `MAX_TOOL_CALLS = 3` actual tool executions. Once the tool budget is spent,
  `tool_choice` is forced to `none` so the model must answer in text instead of
  looping forever.
- **System prompt**: a long, explicit instruction block that tells the model to
  use structured filters (not free text), to call `search_products` for product
  requests and `get_orders` for order requests, the stopping rules, and — very
  important — to reply with only a short sentence because the **UI renders the
  cards**, not the text.
- **Deterministic filter merge** (`mergeFilters`): for `search_products`, the
  model only sends the changed field(s); the server merges them onto the saved
  filter state so refinements never lose earlier constraints. `reset: true`
  starts fresh for a new product type.
- **Auth injection**: shopper auth/locale/customerNo is attached **only at the
  `mcp.callTool` boundary** — never put into the message list, tool-call log, or
  telemetry. This keeps the token out of the model's view and out of logs.
- **Structured capture**: after each tool call, the agent pulls
  `structuredContent.products` / `.suggestions` / `.orders` so the final result
  carries machine-readable data for the UI (the UI never parses the sentence).

### 5.3 MCP server layer — `index.ts`
A tiny program that registers the tools and serves them over stdio
(`McpServer` + `StdioServerTransport`). It registers two tools, both marked
`readOnlyHint: true` so MCP hosts can skip write-confirmation prompts:
- `search_products`
- `get_orders`

Each registration wraps the tool's `run*` function, returns both
`structuredContent` (machine-readable) and a `text` block (the same data as
JSON), and converts thrown errors into `{ isError: true }`. **stdout is reserved
for the MCP protocol; all logs go to stderr.**

### 5.4 Tools layer — `tools/searchProducts.ts`, `tools/getOrders.ts`
Each tool owns: a **zod input schema**, a **stable output type**, and a `run*`
function that validates input, builds GraphQL variables, calls the client, and
maps the raw response into the stable shape. Details in section 6.

### 5.5 UACAPI client layer — `uacapi/client.ts`
A thin, read-only GraphQL client (native `fetch`, no extra deps). Key points:
- Always sends a **static query document + a `variables` object** — never string
  interpolation. This removes GraphQL injection risk and preserves server query
  plan caching.
- `request(query, variables, overrides)`:
  - Merges context headers (`ua-site-code`, `ua-language-code`, `uaclienttype`)
    from static config, with per-request `overrides.contextHeaders` winning.
  - Uses `overrides.bearerToken` if given, else the static configured token.
  - Applies a timeout (`UACAPI_TIMEOUT_MS`, default 15s) via `AbortController`.
  - On non-2xx or a GraphQL `errors` array, throws `UacapiRequestError` with the
    underlying messages. Never logs the token (optional `DEBUG_UACAPI=1` redacts it).

### 5.6 GraphQL operations — `uacapi/searchProducts.ts`, `uacapi/getOrders.ts`
Static GraphQL documents plus the raw response TypeScript types. For orders the
operation is:

```graphql
query McpGetOrders($first: Int, $siteId: String!, $customerNo: String!) {
  orders(first: $first, input: { siteId: $siteId, customerNo: $customerNo }) {
    totalCount
    edges { node {
      orderNo creationDate status orderType currency
      productTotal shippingTotal taxTotal orderTotal
      orderItems {
        fulfillmentStatus
        productItem {
          quantity
          product {
            sku
            copy { name }
            prices { sale base discount total }
            assets { images(context: { width: 600, height: 600 }) { url viewType } }
          }
        }
      }
    } }
  }
}
```

### 5.7 Config layer — `config.ts`
Loads and validates environment variables at startup (see section 10). It builds
the context-header map, sanitizes the bearer token (strips a stray `Bearer `
prefix and whitespace from pastes), validates the endpoint URL, and fails fast
with a clear message if required values are missing.

---

## 6. The MCP tools in detail

### 6.1 `search_products`
- **Purpose**: read-only product search against UACAPI.
- **Model-facing input** (zod): `query`, `categoryId` (at least one required),
  `limit` (default 20), `sort` (`top-sellers`, `now-trending`, `price-low-high`,
  `price-high-low`, `newest`, `top-rated`), `minPrice`, `maxPrice`, `color`
  (color group, e.g. `Black`), `gender` (`Mens`/`Womens`/`Boys`/`Girls`/
  `Unisex`), and `reset` (clear remembered filters for a new product type).
- **Server-injected** (hidden from the model): `auth { bearerToken, siteCode,
  languageCode }`.
- **UACAPI op**: `McpSearchProducts` → `search(...)`.
- **Output** (`SearchProductsResult`): `{ totalCount, count, pageInfo,
  products[], suggestions }`, where each product has id, name, style, url,
  pricing (list/sale bands), currency, orderable flag, color variations, and
  image URLs; `suggestions` are dynamic refine chips (color/gender/price/sort).
- **Auth**: uses the **shopper's** bearer token so results, pricing, and
  availability are correct for that shopper and locale.

### 6.2 `get_orders`
- **Purpose**: read-only order-history lookup.
- **Model-facing input** (zod): only `limit` (1–50, default 3).
- **Server-injected**: `auth { siteCode, languageCode, customerNo }`.
- **UACAPI op**: `McpGetOrders` → `orders(first, input: { siteId, customerNo })`.
- **Output** (`GetOrdersResult`): `{ totalCount, count, orders[] }`. Each
  `Order` has `orderNo`, `creationDate`, `status`, `orderType`, `currency`,
  `totals { subtotal, shipping, tax, grandTotal, discount }`, and `items[]`
  where each item is `{ name, sku, quantity, price, fulfillmentStatus, imageUrl }`.
- **Mapping notes** (`mapOrder`):
  - `subtotal/shipping/tax/grandTotal` come from `productTotal/shippingTotal/
    taxTotal/orderTotal`.
  - There is no order-level discount field, so the mapper **sums per-item
    discounts**.
  - `imageUrl` is chosen by `pickImageUrl` (prefers the full-product `default`
    view) and normalized for Scene7 so the whole product fits a square box
    without cropping (`fit=constrain`, white background, size from
    `UACAPI_IMAGE_SIZE`, default 600).
- **Auth (important)**: the `orders` resolver is **shield-gated to an integration
  (machine) token**. A per-shopper token is rejected with *"Must have an
  integration token"*. So `get_orders` authenticates with
  `UACAPI_INTEGRATION_TOKEN` (falling back to the static `UACAPI_BEARER_TOKEN`
  when unset) and **never** uses the injected shopper token.
- **customerNo** must be the **UUID identity id** (taken from the shopper
  token's `sub.customerNo`), not a short numeric id. It still forwards
  `ua-site-code` / `ua-language-code` so the order data is locale-correct.

---

## 7. Data models

There are three families of models. Keeping them separate is intentional: the UI
and the agent are insulated from UACAPI schema changes by the stable tool output.

### 7.1 UI models — `conversational-ai-widget/src/lib/types.ts`
- `Product` — id, name, brand, price, originalPrice, currency, imageUrl,
  productUrl, availability, availableColors / availableSizes, rating.
- `OrderSummary` — orderNo, creationDate, status, currency, totals, items[].
- `RefinementSuggestions` — refine chips + sort options.
- `AppliedFilters` — the filters currently in effect (shown as chips).
- `ChatMessage`, `ChatStreamEvent` — chat state and simulated-stream events.

The widget's `McpClient` maps backend JSON into these. For products it also has
a `scene7Url()` fallback to build an image URL from style + color code when the
backend did not supply one. Orders are validated by `sanitizeOrders()` so a
malformed shape is dropped rather than rendered.

### 7.2 Tool I/O models — `mcp-uacapi/src/tools/*`
- `SearchProductsInput` / `SearchProductsResult` (+ `Product`, `SearchSuggestions`).
- `GetOrdersInput` / `GetOrdersResult` (+ `Order`, `OrderItem`, `OrderTotals`).

These are the **stable contract** between the backend and the widget.

### 7.3 Raw GraphQL models — `mcp-uacapi/src/uacapi/*`
`RawOrderNode`, `RawOrderConnection`, `RawVariantProduct`, etc. mirror UACAPI's
schema exactly and are **never** exposed outward; the mapper converts them to the
stable shapes above.

### 7.4 The LLM
`openai.gpt-oss-120b` served via AWS Bedrock through an OpenAI-compatible
endpoint. The agent presents the tools to it as function tools; the model's job
is intent → tool arguments → a short final sentence.

---

## 8. Authentication and locale

| Concern | Source | Flows to | Used by |
|---|---|---|---|
| Shopper token | host `getAuthToken()` → `Authorization` header | `auth.bearerToken` | `search_products` (shopper-correct catalog/pricing) |
| Integration token | `UACAPI_INTEGRATION_TOKEN` (server env) | client override | `get_orders` (shield-gated `orders` query) |
| customerNo (UUID) | `x-ua-customer-no` header | `auth.customerNo` | `orders(input.customerNo)` |
| Locale | `x-ua-locale` (e.g. `en-us`) | `siteCode` + `languageCode` | both tools (`ua-site-code` / `ua-language-code`) |

Two hard rules:
- The **shopper token is never sent to the LLM** and is **never used for
  orders**. It is injected only at the tool-call boundary.
- The **integration token is never exposed to the browser**; it lives only in
  the backend environment.

---

## 9. Sessions and filter memory

Two kinds of memory are kept per `sessionId` (in `http.ts`):

1. **Conversation history** — recent user/assistant turns, so the model has
   context on follow-ups. Bounded to 20 turns; long assistant answers are
   trimmed to 800 chars when replayed.
2. **Accumulated search filters** — the structured `SearchFilterState`
   (`query`, `minPrice`, `color`, …). On a refinement the model sends only the
   new field; `mergeFilters()` layers it on top so *"training shoes"* →
   *"under $100"* → *"only black"* keeps all three constraints. A new product
   type with `reset: true` clears the old filters.

This deterministic server-side merge is why refinements are reliable instead of
depending on the model to re-remember every prior constraint.

---

## 10. Configuration (environment variables)

Set in `mcp-uacapi/.env` (see `.env.example`). The server loads `.env` itself so
MCP hosts don't need `--env-file`.

| Variable | Required | Purpose |
|---|---|---|
| `UACAPI_ENDPOINT` | yes | UACAPI GraphQL URL. Validated at startup. |
| `UACAPI_BEARER_TOKEN` | — | Static fallback token (sanitized of `Bearer `/whitespace). |
| `UACAPI_INTEGRATION_TOKEN` | for orders | Machine token for the shield-gated `orders` query. |
| `UACAPI_CUSTOMER_NO` | — | Fallback UUID customerNo for CLI/no-header testing. |
| `UACAPI_SITE_CODE` / `UACAPI_LANGUAGE_CODE` | — | Default site/language context headers. |
| `UACAPI_CLIENT_TYPE` / `UACAPI_USER_AGENT` | — | Client-type context headers. |
| `UACAPI_HEADERS` | — | JSON object of extra custom headers (applied last). |
| `UACAPI_TIMEOUT_MS` | — | Request timeout (default 15000). |
| `UACAPI_IMAGE_SIZE` | — | Square image box in px for order item images (default 600). |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | yes | Bedrock (OpenAI-compatible) creds. Re-read per run. |
| `OPENAI_MODEL` | — | Model id (default `openai.gpt-oss-120b`). |
| `API_PORT` | — | HTTP port (default 8787). |
| `AGENT_DEFAULT_SESSION` | — | Shared session id for plain `{prompt}` calls; `off` to isolate. |
| `DEBUG_UACAPI` / `DEBUG_UACAPI_FILE` | — | Opt-in request/response logging (token redacted). |

---

## 11. Error handling and debugging

- **UACAPI errors**: non-2xx status or a GraphQL `errors` array throws
  `UacapiRequestError` with the underlying message; the tool returns
  `{ isError: true, text }`, and the agent feeds that back so the model can tell
  the user plainly.
- **Model/Bedrock errors**: the agent logs `status/code/type/requestID` to
  stderr and gives a specific hint on 401 (expired/truncated token or wrong
  `OPENAI_BASE_URL`/region).
- **Debug tracing**: set `DEBUG_UACAPI=1` to log each outgoing GraphQL request
  and response (Authorization redacted); set `DEBUG_UACAPI_FILE` to also append
  to a file you can `tail -f`.
- **Agent tracing**: the agent logs what the model *requested* and the
  *effective* arguments after the filter merge, so you can see exactly how a
  prompt became tool calls.
- **Loop guards**: `MAX_TOOL_CALLS = 3` and the per-tool stopping rules in the
  system prompt prevent the model from looping on retries.

---

## 12. Security design choices

- **Read-only tools only.** The MCP server exposes just `search_products` and
  `get_orders`, both annotated read-only. The LLM cannot reach UACAPI directly
  or perform writes.
- **GraphQL variables only.** No string interpolation → no injection, and query
  plans stay cacheable.
- **Credential isolation.** Shopper token for search, integration token for
  orders; the shopper token never reaches the model or logs, and the integration
  token never reaches the browser.
- **Stable output models.** The UI depends on the tool's stable shape, not on
  UACAPI's schema, so backend schema drift does not ripple into the client.
- **Deterministic filter accumulation.** Refinements are merged on the server,
  not entrusted to model memory.
- **Bounded memory.** Sessions and turns are capped; tokens are redacted in all
  diagnostics.

---

## 13. How to run and test

From `mcp-uacapi/`:

```bash
npm install
npm run build            # compile TypeScript to dist/
npm run serve            # start the HTTP API on API_PORT (default 8787)
```

Quick checks (no LLM needed):

```bash
# product search
curl -s localhost:8787/search \
  -H 'content-type: application/json' \
  -d '{"query":"running shoes","maxPrice":100,"color":"Black","limit":5}'

# order history (header auth preferred; body allowed for testing)
curl -s localhost:8787/orders \
  -H 'content-type: application/json' \
  -H 'x-ua-locale: en-us' \
  -H 'x-ua-customer-no: <UUID>' \
  -d '{"limit":3}'
```

Full agent (LLM + tools), mirroring what the widget sends:

```bash
curl -s localhost:8787/agent \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <shopper token>' \
  -H 'x-ua-locale: en-us' \
  -H 'x-ua-customer-no: <UUID>' \
  -d '{"sessionId":"demo-1","prompt":"show my last 3 orders"}'
```

The widget points at the same server via its `mcpServerUrl` prop and adds the
same headers through `getAuthToken()` and `locale`.
```
