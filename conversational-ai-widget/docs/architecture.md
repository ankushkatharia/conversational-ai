# Conversational AI Widget - Integration Architecture

> Repository: `@ua/conversational-ai-widget`
> Status: Draft
> Scope: **Integration only.** Authentication and locale/location are deferred (see [Future Work](#9-future-work-out-of-scope)).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Reality Check: conversational-ui Is a Next.js App](#2-reality-check-conversational-ui-is-a-nextjs-app)
3. [Integration Strategy: Separate Package, Native Mount](#3-integration-strategy-separate-package-native-mount)
4. [Next.js to React Conversion Workstream](#4-nextjs-to-react-conversion-workstream)
5. [Package Contract (Props)](#5-package-contract-props)
6. [MCP Server Communication (Direct From Client)](#6-mcp-server-communication-direct-from-client)
7. [Seabiscuit Mount Point](#7-seabiscuit-mount-point)
8. [Feature Flag](#8-feature-flag)
9. [Future Work (Out of Scope)](#9-future-work-out-of-scope)
10. [Action Plan (Phased)](#10-action-plan-phased)
11. [Open Questions](#11-open-questions)

---

## 1. Executive Summary

This document describes how the existing `conversational-ui` chat experience is packaged as an npm React component (`@ua/conversational-ai-widget`) and mounted inside the Seabiscuit PWA.

**Key architectural decision:** the widget ships as a native React component published to JFrog and consumed by Seabiscuit via a thin wrapper, following the same pattern as `@ua/ua-web-components`, `@ua/beacon-bridge`, and `@ua/store-locator`. This avoids all cross-origin iframe complexity.

**However**, the current `conversational-ui` is a full **Next.js App Router application**, not a React component library. The first and largest piece of integration work is therefore a **Next.js to React conversion** (Section 4): extracting the chat UI into framework-agnostic React and dropping the Next-only server layer.

### Current Scope

| In scope now | Deferred (future) |
|--------------|-------------------|
| Convert `conversational-ui` into a React component library | Bearer-token authentication (guest / registered) |
| Publish `@ua/conversational-ai-widget` to JFrog | Locale / language / country / region propagation |
| Mount the widget in Seabiscuit behind a feature flag | Geo-location awareness (store locator, shipping) |
| Widget calls the MCP server directly from the client (no tokens) | Guest-to-registered session handoff |
| Render chat, streaming, product cards | Cart / checkout write actions |

### Existing Assets

| Asset | Location | Description |
|-------|----------|-------------|
| `conversational-ui` | Separate repo (`conversational-ui/`) | Standalone **Next.js** app for the chat UI + BFF |
| `mcp-uacapi` | Separate repo (`mcp-uacapi/`) | Backend agent API (`POST /agent`, `POST /search`) |
| `@ua/conversational-ai-widget` | This repo (`conversational-ai-widget/`) | Target React component package (scaffold: `src/components`, `src/lib`, `src/styles`) |

---

## 2. Reality Check: conversational-ui Is a Next.js App

`conversational-ui` cannot be published and mounted as-is, because its chat logic is tied to Next.js server primitives that do not exist inside a consuming React app:

| Next.js-only piece | File(s) | Why it blocks "just publish it" |
|--------------------|---------|---------------------------------|
| BFF route handlers | `src/app/api/**` (`conversations`, `auth`) | The browser calls same-origin `/api/*`; a packaged component has no such routes |
| Server orchestrator | `src/lib/server/agent.ts`, `conversations.ts` | Server-only modules; proxy to `mcp-uacapi`, hold in-memory state |
| Route protection | `src/proxy.ts` | Next 16 middleware; irrelevant inside a host app |
| Pages / layouts | `src/app/page.tsx`, `src/app/chat/**`, `src/app/auth/**` | App chrome, not widget surface |
| `next/image` | `products/ProductImage.tsx`, `ui/Logo.tsx` | Requires Next image pipeline + config |
| `next/link` | `products/ProductCard.tsx`, `ProductDetailDrawer.tsx` | Host owns routing |
| `next/navigation` | `chat/ChatShell.tsx` (`useSearchParams`), `layout/AppHeader.tsx` | Depends on Next router context |

The reusable core that **can** become a component already exists and is framework-agnostic in spirit:

- `src/components/chat/*` (ChatShell, ChatMessageList, ChatMessage, MessageComposer, TypingIndicator, SuggestedPrompts, RefinementChips, `useChat`)
- `src/components/products/*` (ProductCard, ProductGrid, ProductCarousel, ProductDetailDrawer, Rating, badges)
- `src/components/ui/*` (Button, Input, Drawer)
- `src/lib/types.ts`, `src/lib/utils.ts`

The browser-side API client (`src/lib/api/client.ts`) already speaks the stable `ChatStreamEvent` / `Product` contract. It only needs its target changed from the same-origin BFF to the MCP server (Section 6).

---

## 3. Integration Strategy: Separate Package, Native Mount

```
┌─────────────────────────────────────────────────────┐
│  @ua/conversational-ai-widget  (this repo)           │
│                                                      │
│  Exports:                                            │
│    ChatbotWidget         (React component)           │
│    ChatbotWidgetProps    (TypeScript interface)      │
│                                                      │
│  Accepts via props:                                  │
│    - mcpServerUrl        (base URL)                  │
│    - onNavigate?         (host routing callback)     │
│    - onAddToCart?        (host cart callback)        │
│                                                      │
│  Internally handles:                                 │
│    - Chat UI (launcher, panel, messages, input)     │
│    - MCP server calls + SSE streaming               │
│    - Message / conversation state                   │
│                                                      │
│  Published to: JFrog (@ua scope)                     │
└──────────────────────────┬──────────────────────────┘
                           │ npm install @ua/conversational-ai-widget
                           ▼
┌─────────────────────────────────────────────────────┐
│  Seabiscuit PWA                                      │
│                                                      │
│  ChatbotWrapper (thin wrapper)                       │
│    - Reads MCP URL from UaConfigPublicImpl          │
│    - Bridges onNavigate to the Next.js router       │
│    - Gated behind the hasConversationalAi flag      │
│                                                      │
│  Mounted in: ClientLayout.tsx <Suspense> block      │
└─────────────────────────────────────────────────────┘
```

### Why Not Iframe

| Concern | Iframe | Separate Package |
|---------|--------|------------------|
| CSS theming | Duplicated / synced via messages | Shared CSS variables (same origin) |
| Bundle size | Two full apps loaded | Single shared bundle |
| Cookie / cross-origin | `SameSite=None; Secure`, blocked by Safari/Firefox | Same origin, no cookie issues |
| Accessibility | Focus trapping across the boundary is unreliable | Native focus management |
| Future auth/locale | Requires `postMessage` plumbing | Direct props (when added later) |

The iframe's one advantage, hard crash isolation, is covered by a React Error Boundary around the mount.

---

## 4. Next.js to React Conversion Workstream

This is the core of the current integration effort. The goal is a buildable React library under `conversational-ai-widget/src/` with **no Next.js dependency**.

### 4.1 What to Port

| Source (`conversational-ui/src`) | Target (`conversational-ai-widget/src`) | Change |
|----------------------------------|-----------------------------------------|--------|
| `components/chat/*` | `components/` | Port as-is; strip `next/navigation` |
| `components/products/*` | `components/` | Replace `next/image` and `next/link` |
| `components/ui/*` | `components/` | Replace `next/image` in `Logo` |
| `lib/types.ts`, `lib/utils.ts` | `lib/` | Port as-is |
| `lib/api/client.ts` | `lib/mcp-client.ts` | Re-point from `/api/*` BFF to `mcpServerUrl` (Section 6) |

### 4.2 What to Drop

- `src/app/**` (all Next routes, pages, and `api` route handlers)
- `src/proxy.ts` (Next middleware)
- `src/lib/server/**` (server-only BFF orchestrator and in-memory stores)
- `src/lib/auth/**` and `components/auth/*` (auth is deferred)
- `components/layout/AppHeader.tsx`, `AppFooter.tsx` (host owns chrome)

### 4.3 Next-Specific Replacements

| Next API | Replacement in the package |
|----------|----------------------------|
| `import Image from "next/image"` | Plain `<img loading="lazy">` with the existing fallback logic |
| `import Link from "next/link"` | `<a>` that calls the `onNavigate` prop (falls back to `href`) |
| `useRouter()` | `onNavigate` prop |
| `useSearchParams()` (in `ChatShell`) | Internal component state / props; no URL coupling |
| Path alias `@/lib/*` | Keep the alias in the package `tsconfig`, or switch to relative imports |

### 4.4 Build Output

- Bundler: `tsup` (or Vite library mode) producing ESM + type declarations.
- `react` and `react-dom` as **peer dependencies** (never bundled) so the host shares one React instance.
- `react-markdown` and `lucide-react` stay as regular dependencies (already used by the UI).
- Styles ship as CSS (Tailwind v4 is compiled to a stylesheet, or SCSS/CSS modules), consuming CSS variable tokens for theming.

---

## 5. Package Contract (Props)

Everything that crosses the boundary in the current scope. Auth and locale props are intentionally absent.

```typescript
// @ua/conversational-ai-widget/src/types.ts

export interface ChatbotWidgetProps {
  /** Base URL of the MCP server, e.g. 'https://mcp-server.ua.dev'. */
  mcpServerUrl: string

  /**
   * Called when the AI suggests navigating to a page (e.g. a product URL).
   * The host pushes the route through its own router. Falls back to an anchor
   * if omitted.
   */
  onNavigate?: (url: string) => void

  /**
   * Called when the AI suggests adding a product to the cart.
   * Optional; cart actions render as disabled placeholders until wired.
   */
  onAddToCart?: (productId: string, sku: string) => void

  /** Optional class for host-side positioning/overrides. */
  className?: string
}
```

| Direction | Item | Detail |
|-----------|------|--------|
| Export | `ChatbotWidget` | React component; the only runtime entry point |
| Export | `ChatbotWidgetProps` | TypeScript type the wrapper imports |
| Prop in | `mcpServerUrl` | Per-environment base URL, read from host config |
| Callback out | `onNavigate(url)` | Host routes through Next.js router |
| Callback out | `onAddToCart(productId, sku)` | Host writes through the cart engine (optional) |
| Peer dependency | `react`, `react-dom` | Shared with host, not bundled |
| Registry | JFrog, `@ua` scope | Private registry, exact versions pinned |

---

## 6. MCP Server Communication (Direct From Client)

In the current scope the widget talks to the MCP server **directly from the browser**, with no auth tokens and no `X-UA-*` locale headers. The `conversational-ui` BFF layer is not carried over.

```
Browser (ChatbotWidget)
   │  fetch(`${mcpServerUrl}/agent`)          ← no Authorization header yet
   ▼
mcp-uacapi  (POST /agent → answer + products; POST /search)
```

### Client Shape

Port `conversational-ui/src/lib/api/client.ts` to `src/lib/mcp-client.ts`, keeping the stable `ChatStreamEvent` / `Product` contract but changing the target:

```typescript
// Before (conversational-ui BFF): same-origin
fetch(`${apiBaseUrl}/api/conversations/${id}/messages?stream=1`, ...)

// After (widget, direct to MCP):
fetch(`${mcpServerUrl}/agent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId, prompt }),
})
```

- Streaming parsing (`data: ...\n\n` SSE frames) and the `token` / `products` / `suggestions` / `refinements` / `filters` / `done` / `error` event union are reused unchanged.
- Session id is a client-generated conversation id, forwarded so the backend accumulates filters (same behaviour as `agent.ts` today).
- `onAuthExpired` / 401 handling is **not** added yet; it arrives with the auth workstream.

> **CORS note:** calling the MCP server directly requires the MCP server to allow the Seabiscuit origin (and localhost for dev). Track as an open question.

### Configuration

```yaml
# Seabiscuit config/app/development.yaml
chatbot:
  mcp_server_url: "http://localhost:8787"

# Seabiscuit config/app/production.yaml
chatbot:
  mcp_server_url: "https://mcp-server.ua.dev"
```

Accessed via `UaConfigPublicImpl.chatbot.mcpServerUrl`.

---

## 7. Seabiscuit Mount Point

### Thin Wrapper

```typescript
// apps/web/components/shared/ChatbotWrapper/ChatbotWrapper.tsx
'use client'

import { ChatbotWidget } from '@ua/conversational-ai-widget'
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useFeatureFlagsBool } from '~/components/providers/FeatureFlagProvider/FeatureFlagProvider'
import { UaConfigPublicImpl } from '~/lib/client-only/ua-config'

export default function ChatbotWrapper() {
  const { hasConversationalAi } = useFeatureFlagsBool(['hasConversationalAi'])
  const router = useRouter()

  const handleNavigate = useCallback((url: string) => router.push(url), [router])

  if (!hasConversationalAi) return null

  return (
    <ChatbotWidget
      mcpServerUrl={UaConfigPublicImpl.chatbot?.mcpServerUrl ?? ''}
      onNavigate={handleNavigate}
    />
  )
}
```

### Mounting

```typescript
// apps/web/components/layouts/ClientLayout.tsx
import dynamic from 'next/dynamic'

const ChatbotWrapper = dynamic(
  () => import('../shared/ChatbotWrapper/ChatbotWrapper'),
  { ssr: false },
)

// Inside the existing <Suspense> block:
<Suspense>
  {/* ...existing ...*/}
  <ChatbotWrapper />
</Suspense>
```

`dynamic` with `ssr: false` keeps the widget JS client-only and off the server-rendered HTML path.

---

## 8. Feature Flag

One Flagsmith flag acts as the master toggle and kill switch for the current scope.

| Flag | Type | Description |
|------|------|-------------|
| `hasConversationalAi` | Boolean | Master on/off for the widget |

Locale and user-type allowlists (`conversationalAiLocales`, `conversationalAiUserTypes`) are added later with the locale and auth workstreams.

---

## 9. Future Work (Out of Scope)

Deferred to later phases; intentionally not designed here:

- **Authentication:** passing the UACAPI Bearer token, `onAuthExpired` / 401 refresh, guest vs registered, customer number, VIP/loyalty flags.
- **Locale & location:** `X-UA-*` headers, language/country/site-code/region, geo-detection, store locator, multi-locale rollout.
- **Guest-to-registered handoff:** migrating chat history on login.
- **Cart / checkout writes:** wiring `onAddToCart` to the cart engine.

The props contract is designed so these become additive props (`auth`, `locale`) without breaking the integration shipped now.

---

## 10. Action Plan (Phased)

### Phase 0: Package Foundation

| # | Task | Details |
|---|------|---------|
| 0.1 | Set up build tooling in `conversational-ai-widget` | `tsup`/Vite library mode, ESM + `.d.ts`, `react`/`react-dom` peers |
| 0.2 | Define `ChatbotWidgetProps` | The contract in Section 5 |
| 0.3 | Add `chatbot.mcp_server_url` to Seabiscuit config schema | YAML + validation |
| 0.4 | Create Flagsmith flag `hasConversationalAi` | Boolean, off by default |
| 0.5 | Confirm MCP server CORS allows the host origin | Dev + prod origins |

### Phase 1: Next.js to React Conversion

| # | Task | Details |
|---|------|---------|
| 1.1 | Port `lib/types.ts`, `lib/utils.ts` | As-is |
| 1.2 | Port `components/ui/*` | Replace `next/image` in `Logo` |
| 1.3 | Port `components/products/*` | Replace `next/image`, `next/link` |
| 1.4 | Port `components/chat/*` + `useChat` | Strip `next/navigation` (`useSearchParams`) |
| 1.5 | Build `mcp-client.ts` from `lib/api/client.ts` | Re-point to `mcpServerUrl`, keep SSE parsing |
| 1.6 | Assemble `ChatbotWidget` (launcher + panel) | Single exported entry point |
| 1.7 | Port / adapt the Vitest suite | Chat, products, streaming |

### Phase 2: Publish & Mount

| # | Task | Details |
|---|------|---------|
| 2.1 | Publish `@ua/conversational-ai-widget` to JFrog | Pinned version |
| 2.2 | Build `ChatbotWrapper` in Seabiscuit | Section 7 |
| 2.3 | Mount in `ClientLayout.tsx` behind the flag | `dynamic`, `ssr: false` |
| 2.4 | End-to-end smoke test | Open widget, send message, verify MCP response renders |

### Phase 3: Polish & Rollout

| # | Task | Details |
|---|------|---------|
| 3.1 | Error / empty / rate-limit states | User-facing copy |
| 3.2 | Accessibility pass | Focus trap, ARIA live regions |
| 3.3 | Bundle-size and performance audit | Peer-dep sharing, lazy load |
| 3.4 | Internal dogfood, then flag rollout | `hasConversationalAi` staged on |

---

## 11. Open Questions

| # | Question |
|---|----------|
| 1 | Does the MCP server (`mcp-uacapi`) expose CORS for direct browser calls, or is a host-side proxy needed even in the no-auth phase? |
| 2 | Bundler choice: `tsup` vs Vite library mode? |
| 3 | How are Tailwind v4 styles shipped (precompiled CSS vs CSS modules) so they do not collide with the host's styles? |
| 4 | Which CSS variable tokens should the widget consume for theming inside Seabiscuit? |
| 5 | Should the widget be hidden on checkout pages? |
| 6 | Should conversation state persist across SPA navigation (and later, across sessions)? |
