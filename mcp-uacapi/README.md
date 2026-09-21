# mcp-uacapi

A read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes
UACAPI (the Under Armour Commerce API) product search to MCP-compatible hosts such as Claude
Desktop and IDE assistants.

> **Phase 1 scope:** a single, strictly **read-only** tool (`search_products`). No mutations, no
> cart/checkout, no customer data. Future phases will add more read tools behind the same server.

---

## Why this exists

MCP hosts (LLM clients) cannot call UACAPI's GraphQL API directly in a safe, structured way. This
server provides a thin, opinionated bridge that:

- exposes only vetted, read-only operations,
- validates input before touching the network,
- sends GraphQL **variables** (never string-concatenated queries), and
- returns a **stable output schema** that is decoupled from UACAPI's internal GraphQL types, so
  clients don't break when the underlying schema evolves.

---

## Architecture

```
MCP host (Claude, IDE, ...)
        │  JSON-RPC over stdio
        ▼
  src/index.ts            → registers the tool, serves stdio transport
        │
        ▼
  src/tools/searchProducts.ts  → input schema + validation + raw→stable mapping
        │
        ▼
  src/uacapi/client.ts     → GraphQL client (fetch + variables)
  src/uacapi/searchProducts.ts → static query document + raw response types
        │  HTTPS POST { query, variables }
        ▼
     UACAPI /graphql
```

| File | Responsibility |
| --- | --- |
| `src/config.ts` | Loads/validates env config (`UACAPI_ENDPOINT`, bearer token, timeout). |
| `src/uacapi/client.ts` | Read-only GraphQL client. Always sends `{ query, variables }`. |
| `src/uacapi/searchProducts.ts` | Static `searchProducts` query + raw response types. |
| `src/tools/searchProducts.ts` | Tool input schema, validation, and stable output mapping. |
| `src/index.ts` | Registers `search_products` and serves it over stdio. |

---

## The `search_products` tool

### Input schema

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string | conditionally | Free-text search phrase. Must be non-empty if provided. |
| `categoryId` | string | conditionally | UACAPI category id refinement. Must be non-empty if provided. |
| `limit` | integer | no | Page size, `1`–`100`. Defaults to `20`. |

**Validation rule:** at least one of `query` or `categoryId` must be provided. Both may be combined
to search within a category.

### Output schema (stable)

```jsonc
{
  "totalCount": 128,          // total matches available in UACAPI
  "count": 20,                // number of products in this response
  "pageInfo": {
    "hasNextPage": true,
    "hasPreviousPage": false,
    "startCursor": "…",
    "endCursor": "…"
  },
  "products": [
    {
      "id": "1234567-001",
      "style": "1234567",     // normalized from master `style` / slicing `slicedProductId`
      "name": "Men's UA HOVR Phantom",
      "url": "/mens/shoes/...",
      "orderable": true,
      "currency": "USD",
      "price": {
        "list": { "min": 140.0, "max": 140.0 },
        "sale": { "min": 112.0, "max": 140.0 }
      },
      "colors": [
        { "code": "001", "name": "Black", "hex": "000000", "orderable": true }
      ]
    }
  ]
}
```

The raw UACAPI GraphQL response is **never** returned directly; it is mapped into the shape above.

### Under the hood

The tool calls the UACAPI `searchProducts` query. User input flows only through GraphQL variables:

```graphql
query McpSearchProducts($q: String, $first: Int, $refinement: SearchRefinementInput) {
  searchProducts(q: $q, first: $first, refinement: $refinement) { ... }
}
```

`categoryId` is passed as `refinement.category`; `query` as `q`; `limit` as `first`.

---

## Setup

Requires Node.js **>= 20** (uses the native `fetch`).

```bash
npm install
npm run build
```

### Configuration

Copy `.env.example` and set the values (or export them in your MCP host config):

| Variable | Required | Description |
| --- | --- | --- |
| `UACAPI_ENDPOINT` | yes | UACAPI GraphQL endpoint URL. |
| `UACAPI_BEARER_TOKEN` | no | Bearer token for the `Authorization` header. Omit for local no-auth dev. |
| `UACAPI_TIMEOUT_MS` | no | Per-request timeout in ms (default `15000`). |

---

## Running

```bash
UACAPI_ENDPOINT="https://uacapi.example.com/graphql" \
UACAPI_BEARER_TOKEN="<token>" \
node dist/index.js
```

The server speaks MCP over **stdio**. Diagnostics go to stderr; stdout is reserved for the protocol.

### Register with an MCP host

Example host configuration (adjust the absolute path):

```json
{
  "mcpServers": {
    "uacapi": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-uacapi/dist/index.js"],
      "env": {
        "UACAPI_ENDPOINT": "https://uacapi.example.com/graphql",
        "UACAPI_BEARER_TOKEN": "<token>"
      }
    }
  }
}
```

---

## Example calls

Search by text:

```json
{ "name": "search_products", "arguments": { "query": "running shoes", "limit": 5 } }
```

Search within a category:

```json
{ "name": "search_products", "arguments": { "categoryId": "mens-shoes" } }
```

Text query refined by category:

```json
{ "name": "search_products", "arguments": { "query": "hovr", "categoryId": "mens-shoes" } }
```

---

## Roadmap

- **Phase 1 (this):** read-only `search_products`.
- Future phases: additional read-only tools (category tree, product detail) reusing the same
  client, validation, and stable-mapping conventions.
