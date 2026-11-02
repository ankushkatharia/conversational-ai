# mcp-uacapi-py

FastAPI backend for the UA conversational shopping assistant. It is a Python port of `../mcp-uacapi` and serves the same
widget contract, so the widget works against either backend.

One tool registry is shared by three surfaces:

- **Agent**: `POST /agent` (JSON) and `POST /agent/stream` (Server-Sent Events). An LLM tool loop with per-session memory.
- **REST tools**: one endpoint per tool, for testing and for direct widget calls.
- **MCP**: the same tools over MCP Streamable HTTP at `POST /mcp`, for external MCP clients.

## Quick start

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+.

```bash
cd mcp-uacapi-py
uv sync
cp .env.example .env          # or copy ../mcp-uacapi/.env: the variable names are the same
uv run uvicorn app.main:app --reload --port 8787
```

- Swagger UI: http://localhost:8787/docs
- ReDoc: http://localhost:8787/redoc
- OpenAPI schema: http://localhost:8787/openapi.json

The widget dev server proxies to `http://localhost:8787` by default. To run this backend next to the Node one, start it on
another port and point the widget at it: `MCP_TARGET=http://localhost:8000 npm run dev`.

Behind a corporate TLS proxy, run `uv sync` with `UV_SYSTEM_CERTS=1`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness. Always 200 while the process is up. |
| GET | `/health/ready` | Readiness. Returns 503 until UACAPI and the selected LLM provider are configured. |
| POST | `/agent` | Ask the assistant. Body: `{sessionId?, prompt}` or `{messages}`. Returns `{answer, products, suggestions, orders, orderDetail, supportTicket, interaction, filters, toolCalls, usage}`. |
| POST | `/agent/stream` | Same input, streamed as SSE events: `tool_call`, `token`, `products`, `suggestions`, `filters`, `orders`, `orderDetail`, `supportTicket`, `interaction`, then `done` (the full `/agent` response) or `error`. |
| DELETE | `/agent/sessions/{session_id}` | Forget a conversation's server-side memory (for "New chat"). |
| GET | `/tools` | List the tools and their input schemas. |
| POST | `/search` | `search_products` |
| POST | `/orders` | `get_orders` |
| POST | `/order-detail` | `get_order_detail_by_order_number` |
| POST | `/support-ticket` | `create_support_ticket` |
| POST | `/mcp` | MCP Streamable HTTP (stateless, JSON responses). Not listed in `/docs`. |

Errors always have the shape `{"error": "..."}`. Validation errors return 400 and add `details`. Every response carries
an `x-request-id` header, which also appears in the logs.

Shopper context comes from request headers, the same ones the widget already sends: `Authorization: Bearer <token>`,
`x-ua-locale`, `x-ua-customer-no`, `x-ua-user-email`. The MCP endpoint reads the same headers.

Example:

```bash
curl -N http://localhost:8787/agent/stream \
  -H 'content-type: application/json' \
  -d '{"sessionId": "demo-1", "prompt": "show me running hoodies"}'
```

## Conversation memory

- Send a stable `sessionId` to keep context across turns. The server keeps the last `SESSION_MAX_TURNS` turns per session.
- A session belongs to the customer that created it (`x-ua-customer-no`). Another customer using the same id gets a fresh,
  unsaved conversation and never sees the original history.
- Without a `sessionId` (and with `AGENT_DEFAULT_SESSION` unset), each request has no server-side memory. Clients can send
  their own history in `messages` instead.
- Sessions live in an in-memory LRU store with a TTL (`SESSION_MAX_SESSIONS`, `SESSION_TTL_S`). Memory is per process,
  so run one worker, or add a shared backend (for example Redis) before scaling out. The store sits behind the
  `SessionStore` protocol in `app/sessions/base.py`, so a new backend is one class plus a branch in
  `build_session_store`.

## LLM providers and prompt caching

`LLM_PROVIDER` selects the model provider. Both sit behind one interface (`app/llm/`), so the agent loop,
streaming, and tools behave the same with either.

| Provider | Setting | How caching works |
| --- | --- | --- |
| OpenAI or OpenAI-compatible (e.g. Bedrock gpt-oss) | `LLM_PROVIDER=openai` | Automatic for repeated prompt prefixes. `OPENAI_PROMPT_CACHE_KEY` keeps a conversation on the same cache, `OPENAI_PROMPT_CACHE_RETENTION` extends lifetime, and `OPENAI_CACHE_BREAKPOINTS` adds an explicit breakpoint after the system prompt (GPT-5.6+). |
| Anthropic API | `LLM_PROVIDER=anthropic`, `ANTHROPIC_BACKEND=api` | Explicit `cache_control` markers: one after the system prompt (tools + system, shared by every shopper) and one on the newest message (the conversation so far). |
| Claude on AWS Bedrock | `LLM_PROVIDER=anthropic`, `ANTHROPIC_BACKEND=bedrock` | Same markers as the Anthropic API. Credentials: `AWS_BEARER_TOKEN_BEDROCK`, access keys, or `AWS_PROFILE`. |

The static prefix (tools and system prompt, about 3,700 tokens) is resent on every model call, and a shopper turn
makes 2 to 4 calls. Caching it bills those tokens at roughly a tenth of the normal input price. To keep the
prefix cacheable, the request is always rendered in the same order (tools, system prompt, history) with the same
bytes; avoid putting per-request values such as timestamps into the system prompt.

Every agent response includes `usage` (`inputTokens`, `cachedInputTokens`, `cacheWriteTokens`, `outputTokens`,
`llmCalls`), summed over the turn. Each model call is also logged:

```
llm call provider=anthropic model=claude-sonnet-5-5 input=3950 cached=3700 cache_write=200 output=30 cache_hit=94%
```

LLM settings are re-read when `.env` changes, so rotating a key or switching provider needs no restart.
## Project layout

```
app/
  main.py          App factory: lifespan, CORS, middleware, routers, /mcp mount
  container.py     Composition root: settings, HTTP clients, tool registry, session store, agent
  api/             FastAPI dependencies and routes (health, agent, tools)
  agent/           System prompt, tool loop and event stream, filter merging
  llm/             Provider-neutral chat types, OpenAI and Anthropic (API/Bedrock) adapters, prompt caching
  tools/           ToolSpec registry and the five tools (shared by REST, agent, and MCP)
  clients/         UACAPI GraphQL client, integration token manager, GraphQL queries
  sessions/        SessionStore protocol and the in-memory LRU/TTL store
  services/        AgentService (session memory around the runner), support mailer
  schemas/         Pydantic models, camelCase on the wire
  core/            Settings, logging, request-id middleware, errors, auth context
  mcp_server.py    MCP Streamable HTTP endpoint
tests/             API and unit tests with a fake UACAPI transport and a scripted fake LLM
```

To add a tool, write a `ToolSpec` in `app/tools/` and register it in `build_registry`. The agent and MCP pick it up
automatically. Add a REST route in `app/api/routes/tools.py` if the widget needs to call it directly.

## Configuration

All settings come from environment variables or `.env`. See `.env.example` for the full list. A blank value (`KEY=`)
means "use the default".

## Development

```bash
uv run pytest            # tests (no network needed)
uv run ruff check .      # lint
uv run ruff format .     # format
```

## Production notes

- Run with several uvicorn workers or replicas only after moving sessions to a shared store.
- Restrict `CORS_ALLOW_ORIGINS` to the storefront origins.
- Use `/health` for liveness probes and `/health/ready` for readiness probes.
