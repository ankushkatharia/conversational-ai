# System Architecture

End-to-end view of the conversational AI stack: the host PWA embeds the widget,
which talks to the `mcp-uacapi` Node backend over HTTPS (JSON + SSE); the backend
runs the agent/MCP tools and calls UACAPI over GraphQL.

```mermaid
flowchart TB
  %% ---------------- Host PWA ----------------
  subgraph HOST["SEABISCUIT · Host PWA"]
    direction TB
    MOUNT["&lt;ChatbotWidget mcpServerUrl=... getAuthToken={...} /&gt;"]

    subgraph WIDGET["conversational-ai-widget"]
      direction TB

      subgraph PANEL["ChatPanel"]
        direction TB

        subgraph LIST["ChatMessageList"]
          direction TB
          MSG["ChatMessage (text, products, orders, forms)"]
          PG["ProductGrid + ProductCard"]
          OL["OrderList + OrderCard"]
          TF["TicketFormCard"]
          CI["ChatInteraction"]
          SP["SuggestedPrompts + RefinePanel"]
        end

        CB["CompareBar"]
        MC["MessageComposer"]
        PDD["ProductDetailDrawer"]
        OTD["OrderTrackingDrawer"]
        CD["ComparisonDrawer"]
        HD["HelpDrawer"]
      end

      subgraph CLIENT["McpClient"]
        direction TB
        C1["streamMessage() → POST /agent/stream"]
        C2["getOrderDetail() → POST /order-detail"]
        C3["createSupportTicket() → POST /support-ticket"]
        C4["compareProducts() → POST /compare"]
      end
    end
  end

  MOUNT --- WIDGET
  PANEL --> CLIENT

  %% ---------------- Backend ----------------
  subgraph BACKEND["mcp-uacapi · Node backend"]
    direction TB

    subgraph HTTP["HTTP Layer (http.ts)"]
      direction TB
      H1["GET  /health"]
      H2["POST /agent"]
      H3["POST /agent/stream"]
      H4["POST /search"]
      H5["POST /orders"]
      H6["POST /order-detail"]
      H7["POST /support-ticket"]
      H8["POST /compare"]
    end

    subgraph AGENT["Agent Layer (agent.ts)"]
      direction TB
      A1["AWS Bedrock LLM"]
      A2["Tool-calling loop"]
      A3["Deterministic filter merge"]
      A4["Support-ticket form interception"]
      A5["SSE progress events"]
      A6["Auth injection at tool-call boundary only"]
    end

    subgraph MCP["MCP Server (index.ts) · stdio"]
      direction TB
      T1["search_products"]
      T2["get_orders"]
      T3["get_order_detail_by_order_number"]
      T4["create_support_ticket"]
      T5["request_user_input"]
    end

    UAC["UACAPI Client · GraphQL POST { query, variables }"]
  end

  HTTP --> AGENT
  AGENT --> MCP
  MCP --> UAC

  %% ---------------- UACAPI ----------------
  subgraph UACAPI["UACAPI · Under Armour Commerce API"]
    direction TB
    U1["search(...) → catalog, pricing, images, refinements"]
    U2["orders(...) → order history and tracking"]
    U3["viewer → customer identity"]
  end

  %% ---------------- Cross-boundary edges ----------------
  CLIENT -- "HTTPS (JSON + SSE)" --> HTTP
  UAC -- "HTTPS GraphQL" --> UACAPI

  classDef host fill:#eef2ff,stroke:#4f46e5,color:#111;
  classDef backend fill:#ecfdf5,stroke:#059669,color:#111;
  classDef api fill:#fff7ed,stroke:#ea580c,color:#111;
  class HOST,WIDGET,PANEL,LIST,CLIENT host;
  class BACKEND,HTTP,AGENT,MCP backend;
  class UACAPI api;
```

## Layers

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Host PWA | SEABISCUIT | Mounts `<ChatbotWidget>`, supplies `mcpServerUrl` + `getAuthToken` |
| Widget | `conversational-ai-widget` | ChatPanel UI, drawers, and `McpClient` HTTP calls |
| Backend | `mcp-uacapi` | HTTP layer, Bedrock agent + tool loop, MCP server, UACAPI client |
| Commerce API | UACAPI | `search`, `orders`, `viewer` over GraphQL |

## Request flow

1. Host renders the widget with the MCP server URL and an auth-token getter.
2. `McpClient` calls the backend over HTTPS; `/agent/stream` streams SSE progress.
3. The agent runs the Bedrock tool-calling loop, injecting auth only at the
   tool-call boundary, and invokes MCP tools over stdio.
4. MCP tools call the UACAPI client, which issues GraphQL queries.
5. Results flow back up: UACAPI → tools → agent → SSE/JSON → widget render.
