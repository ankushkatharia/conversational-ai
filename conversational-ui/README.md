# Under Armour Shopping Assistant

A conversational commerce UI built with **Next.js (App Router)**, **TypeScript**, and
**Tailwind CSS v4**. Shoppers chat in natural language ("black running shoes under
$100") and get curated product recommendations as rich product cards, with a detail
drawer, streaming responses, and email/password auth.

It runs fully offline in **mock mode** (no backend required) and can proxy to the
`mcp-uacapi` conversation backend when you flip an env flag.

> No cart or checkout is implemented in this phase; those actions are shown as
> disabled placeholders only.

---

## Quick start

Requires **Node.js >= 20** (developed on Node 22).

```bash
npm install
cp .env.example .env.local   # defaults to fully-mocked mode
npm run dev                  # http://localhost:3000
```

Sign in with the seeded demo account:

- **Email:** `demo@underarmour.com`
- **Password:** `password123`

Or create a new account at `/auth/sign-up`.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | ESLint (Next core-web-vitals + TS). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test` | Run the Vitest + Testing Library suite. |
| `npm run test:watch` | Watch mode. |

---

## Environment

Copy `.env.example` to `.env.local`. Secrets are **server-only**; only `NEXT_PUBLIC_*`
values reach the browser.

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | public | App name shown in the UI. |
| `NEXT_PUBLIC_API_BASE_URL` | public | Base URL for the app's own API. Empty = same-origin `/api` (recommended). |
| `USE_MOCK` | server | `true` (default) serves fully mocked data. `false` proxies chat to the backend. |
| `AGENT_API_BASE_URL` | server | `mcp-uacapi` HTTP API base (default `http://localhost:8787`). |
| `AUTH_SESSION_SECRET` | server | HMAC secret for signing session cookies. Change in production. |

### Mock mode vs. real backend

- **Mock mode (`USE_MOCK=true`)**: the BFF answers entirely offline with a
  deterministic keyword matcher over a local Under Armour catalog. Great for UI
  development and CI.
- **Backend mode (`USE_MOCK=false`)**: the BFF proxies each prompt to
  `AGENT_API_BASE_URL` (`POST /agent` for the answer, `POST /search` for products) and
  maps the response into the UI's stable `Product` shape. If the backend is
  unreachable, it transparently falls back to mock data so the UI stays usable.

The browser **never** calls the LLM/commerce backend directly; it only talks to this
app's own `/api` (a BFF), which keeps tokens server-side.

---

## Architecture

```
Browser (client components)
   │  fetch same-origin /api/*   (typed client: src/lib/api/client.ts)
   ▼
Next.js Route Handlers (BFF)  src/app/api/**
   ├─ auth: HTTP-only signed session cookie  (src/lib/auth/session.ts)
   ├─ conversations: in-memory per-user store (src/lib/server/conversations.ts)
   └─ agent orchestrator: mock OR proxy       (src/lib/server/agent.ts)
             │ (backend mode only)
             ▼
     mcp-uacapi HTTP API  (POST /agent, /search)
```

- **Auth abstraction** (`src/lib/auth/provider.ts`): `AuthProvider` interface with a
  `LocalAuthProvider` implementation. Swap in an `OktaAuthProvider` later without
  touching the UI (single change point in `getAuthProvider()`).
- **Route protection** (`src/proxy.ts`): Next 16 proxy (middleware) guards `/chat`,
  verifies the signed cookie, and redirects unauthenticated users to
  `/auth/sign-in?redirect=…` (destination preserved).
- **Sessions**: HTTP-only, `SameSite=Lax`, HMAC-signed via Web Crypto (works in both
  the Node route-handler and Edge proxy runtimes). No token is exposed to client JS.

### Routes

| Route | Description |
| --- | --- |
| `/` | Marketing landing page (hero, examples, featured products, footer). |
| `/auth/sign-in` | Email/password sign-in. |
| `/auth/sign-up` | Registration with password strength + validation. |
| `/chat` | Protected conversational shopping experience. |
| `POST /api/auth/sign-in` `sign-up` `sign-out`, `GET /api/auth/me` | Auth BFF. |
| `GET/POST /api/conversations` | List / create conversations. |
| `GET /api/conversations/:id` | Fetch a conversation with messages. |
| `POST /api/conversations/:id/messages` | Send a message (JSON, or SSE with `?stream=1`). |

### Streaming

The message endpoint streams `text/event-stream` when called with `?stream=1`. The
client (`api.streamMessage`) parses SSE events (`token`, `products`, `suggestions`,
`done`, `error`) and supports **cancel** (AbortController), **retry**, and **partial
response recovery**. If streaming can't start, it falls back to the JSON request.

---

## Key directories

```
src/
├── app/
│   ├── page.tsx                  # landing
│   ├── auth/{sign-in,sign-up}/   # auth pages + shared layout
│   ├── chat/                     # protected chat page + layout
│   └── api/                      # BFF route handlers
├── components/
│   ├── layout/                   # AppHeader, AppFooter
│   ├── auth/                     # SignInForm, SignUpForm, PasswordStrength
│   ├── chat/                     # ChatShell, ChatMessageList, ChatMessage,
│   │                             #   MessageComposer, ConversationList,
│   │                             #   SuggestedPrompts, TypingIndicator, useChat
│   ├── products/                 # ProductCard, ProductGrid, ProductCarousel,
│   │                             #   ProductDetailDrawer, ProductBadge, ...
│   └── ui/                       # Button, Input, Drawer, Logo
├── lib/
│   ├── api/client.ts             # typed client (client components)
│   ├── auth/                     # provider abstraction, session, store, context
│   ├── server/                   # BFF-only: conversations, agent, current-user
│   ├── mock/                     # products + offline assistant
│   ├── config.ts, types.ts, utils.ts
└── proxy.ts                      # route protection
```

> Note: the sidebar and mobile navigation are implemented via `ConversationList`
> plus the reusable `Drawer` inside `ChatShell` (rather than separate
> `AppSidebar`/`MobileNav` files).

---

## Accessibility

- Semantic HTML, labelled form fields, and `aria-*` on icon-only buttons.
- Dialog focus management in `Drawer` (focus trap, Escape to close, focus restore).
- Screen-reader-friendly chat updates (`role="log"`, `aria-live="polite"`).
- Visible focus rings, `prefers-reduced-motion` support, skip-to-content link.
- Status is never communicated by color alone (badges/ratings include text).

## Security

- LLM/commerce backend is never called from the browser; the BFF owns it.
- Session token is HTTP-only and signed; nothing sensitive is in `NEXT_PUBLIC_*`.
- Assistant markdown is rendered with `react-markdown` (no raw HTML injection).
- All forms validate input; passwords/tokens are never logged.

## Testing

Vitest + React Testing Library. Covers auth (validation, success, error, toggle,
password mismatch/terms), chat (composer send/enter/cancel, message rendering,
error+retry, empty state), products (card rendering, missing fields, detail drawer,
product link), plus session signing, the mock assistant, and the store.

```bash
npm run test
```

---

## Roadmap / TODO

- Persist users/conversations to a real datastore (current stores are in-memory).
- Add the `OktaAuthProvider` implementation behind the existing `AuthProvider`.
- Wire cart/checkout once those backend capabilities exist.
- Optional: virtualize very long conversation histories.
