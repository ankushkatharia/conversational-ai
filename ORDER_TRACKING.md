# Order Tracking - Implementation Guide

How order tracking works end to end across **mcp-uacapi** (backend tool + API +
agent) and **conversational-ai-widget** (chat UI). Pairs with `ARCHITECTURE.md`.

---

## 1. What the feature does

The assistant understands "track my order" intent and offers two ways to track:

1. **Clickable recent orders** - when the shopper asks about tracking without a
   number, the bot lists their recent orders. Each order card has a **Track**
   button that fetches and shows full tracking in a dialog.
2. **"Track another order" box** - an inline text input to paste/enter any order
   number and track it directly.
3. **Direct order number in chat** - if the shopper types an order number, the
   bot returns that order's detail inline as a compact **tracking card**; tapping
   it opens the same tracking dialog.

The tracking dialog shows: status, per-shipment **status + tracking number +
clickable tracking link + shipped/estimated/delivered dates**, items, and totals.

---

## 2. Data flow

```
User: "track my order"  (no number)
  Widget POST /agent (shopper token, locale, x-ua-customer-no)
    -> LLM calls get_orders  -> orders[]
  Widget renders OrderList (Track buttons) + OrderTrackingPanel (textbox)

User clicks "Track" on an order  OR  submits the textbox
  Widget McpClient.getOrderDetail(orderNo)  -> POST /order-detail
    -> get_order_detail_by_order_number tool
      -> UACAPI orders(first, input:{ siteId, customerNo })   [integration token]
         ... select fulfillmentGroups { shipment { trackingNumber trackingLink ... } }
         ... then filter the returned edges to node.orderNo === orderNumber
  Widget opens OrderTrackingDrawer with the detail (status/tracking/dates)

User: "track order US-DEVNA04-00392564"  (with number)
  Widget POST /agent
    -> LLM calls get_order_detail_by_order_number -> orderDetail
  Widget renders OrderTrackingCard inline (tap -> same dialog, no re-fetch)
```

---

## 2a. Why this resolver (important design note)

Tracking/fulfillment data lives on OIS under
`fulfillmentGroups[].shipment { trackingNumber, trackingLink, estimatedDelivery,
dateShipped, dateDelivered }`. Two other paths were tried and rejected:

- **`orderByOrderNumber(input:{ siteId, orderNumber })`** - returns a different,
  non-OIS view of the order (e.g. `status: IN_PROGRESS`, empty fulfillment), so
  tracking never populated.
- **`viewer { ... on RegisteredCustomer { orders } }`** - this is exactly what
  seabiscuit's `OrderHistoryRedesign` query uses, but it is **not reachable
  through the UACAPI gateway**: the request fails at the transport layer
  (`fetch failed`) rather than returning data.

The **working** path is the same OIS-backed `orders(input:{ siteId, customerNo })`
connection that `get_orders` already uses (authenticated with the integration/
M2M token). It returns the real fulfillment `status` (e.g. `Fulfilled`) **and**
accepts a `fulfillmentGroups { shipment { ... } }` selection. Verified live for
`US-DEVNA04-00392565` (HTTP 200): `Fulfilled`, tracking number
`1Z 998 AA1 01 2115 6999`, a narvar FedEx `trackingLink`, and ship/estimated
dates. Because this resolver has no order-number filter, the tool fetches a
window of the customer's recent orders (`first: 50`) and matches on `orderNo`.

---

## 3. Backend (mcp-uacapi)

### GraphQL op - `src/uacapi/getOrderDetail.ts`
`McpGetOrderDetail` calling
`orders(first: Int, input: { siteId: String!, customerNo: String! })` (the same
resolver as `get_orders`). Selects order fields, `orderItems { fulfillmentStatus
product { copy, prices, assets.images } }`, and the tracking source
`fulfillmentGroups { type fulfillmentStatus shipment { shipmentId trackingNumber
trackingLink estimatedDelivery dateShipped dateDelivered } }`. All input flows
through variables (injection-free). Note: this node does **not** expose
`shippingAddress` / `billingAddress`, so those are returned as `null`.

### MCP tool - `src/tools/getOrderDetail.ts`
- Model-facing input: `orderNumber`. Server-injected `auth`
  (site/locale/customerNo/token).
- Fetches `first: 50` of the customer's orders and returns the edge whose
  `node.orderNo === orderNumber` (or `order: null` if not in the window).
- Stable output `GetOrderDetailResult = { order: OrderDetail | null }` with
  `totals`, `shipments[]`, `items[]` (images Scene7-normalized). Each
  `OrderShipment` now carries `status` (from `fulfillmentStatus`), `trackingNumber`,
  `trackingLink`, `estimatedDelivery`, `dateShipped`, `dateDelivered`.
  `shippingAddress` / `billingAddress` are `null` (not on this resolver).
- Auth: **integration/M2M token** via `requestWithIntegrationToken` (same as
  `get_orders`), which auto-mints/refreshes the Auth0 client-credentials token
  and retries once on 401. Requires `siteId` + `customerNo`.

### Registration + agent - `src/index.ts`, `src/agent.ts`
- Registered as a read-only tool `get_order_detail_by_order_number`.
- System prompt "Order tracking" section: call the tool with the exact
  `orderNumber`; **if no number is given, call `get_orders`** so the UI can show
  the clickable list + textbox; summarize status + tracking in one short line.
- `orderDetail: OrderDetail | null` added to `AgentRunResult` and collected from
  the tool result, so `/agent` returns it alongside `orders`.

### HTTP - `src/http.ts`
`POST /order-detail { orderNumber, siteId? }` -> stable `{ order }` (tool only,
no LLM). Site also resolved from `x-ua-locale` / `x-ua-site-code`; `customerNo`
from `x-ua-customer-no` (falls back to `UACAPI_CUSTOMER_NO`).

### Integration token auto-mint - `src/uacapi/integrationToken.ts`
Both order tools use `requestWithIntegrationToken`, which mints the integration
token from Auth0 (`client_credentials` grant) when `UACAPI_AUTH0_CLIENT_SECRET`
(+ `UACAPI_AUTH0_DOMAIN` / `UACAPI_AUTH0_CLIENT_ID` / `UACAPI_AUTH0_AUDIENCE`) is
set, caches it until ~60s before `exp`, and refreshes on expiry. If auto-mint is
not configured it falls back to the static `UACAPI_INTEGRATION_TOKEN` (and logs a
clear warning when that static token is expired).

---

## 4. Widget (conversational-ai-widget)

### Types - `src/lib/types.ts`
Added `OrderAddress`, `OrderShipment`, `OrderDetail`; added `orderDetail?` to
`ChatMessage` + `SendMessageResponse`; added `{ type: "orderDetail" }` stream
event. `OrderShipment` carries `trackingNumber`, `trackingLink`, `status`,
`estimatedDelivery`, `dateShipped`, `dateDelivered`.

### Client - `src/lib/mcp-client.ts`
- `sanitizeOrderDetail()` coerces the backend payload into `OrderDetail`
  (null-safe), returns null when not found/malformed.
- `callAgent()` now maps `orderDetail`; it is streamed and included in
  `sendMessage`.
- `getOrderDetail(orderNumber, signal?)` -> `POST /order-detail`, returns
  `OrderDetail | null`. Deterministic (no LLM) so clicks are reliable.

### State/hook - `src/hooks/useChat.ts`
Handles the `orderDetail` stream event (patches the assistant message).

### Components - `src/components/orders/`
| File | Role |
|---|---|
| `orderStatus.tsx` | Shared `StatusBadge`, `statusTone`, `formatOrderDate`, `shortOrderNo` (also used by `OrderCard`). |
| `OrderCard.tsx` | Adds a **Track** action (`onTrack`, `tracking` spinner). |
| `OrderList.tsx` | Forwards `onTrack` + `trackingOrderNo` to each card. |
| `OrderTrackingPanel.tsx` | "Track another order" text input + submit. |
| `OrderTrackingCard.tsx` | Compact in-message card for a direct `orderDetail` (tap -> dialog). |
| `OrderTrackingDrawer.tsx` | Centered dialog: order status, per-shipment status badge + tracking number + Track link + shipped/estimated/delivered dates, items, totals; hides unknown (zero) qty/price/totals; loading/error/not-found states. |

### Wiring - `ChatMessage` -> `ChatMessageList` -> `ChatPanel`
- `ChatMessage` renders `OrderList` + `OrderTrackingPanel` when `orders.length > 0`,
  and `OrderTrackingCard` when `orderDetail` is present. Props `onTrackOrder`,
  `onViewTracking`, `trackingOrderNo` are threaded through `ChatMessageList`.
- `ChatPanel` owns the dialog state (`trackingOpen/Loading/Error/Detail/OrderNo`),
  implements `trackOrder(orderNo)` (fetch + open), `viewTracking(detail)` (open
  seeded), and `closeTracking()`, and renders `<OrderTrackingDrawer>` (reuses the
  `contained` modal `Drawer`).
- Refine/suggestions remain product-search only, so they never show for orders.

---

## 5. Extending / troubleshooting
- **No tracking at all / empty `fulfillmentGroups`**: make sure the query hits the
  `orders(input:{ siteId, customerNo })` resolver (not `orderByOrderNumber` or
  `viewer.orders`). Only this resolver returns OIS `status: Fulfilled` plus
  `fulfillmentGroups[].shipment` through the UACAPI gateway.
- **`UACAPI request failed: fetch failed`**: that was the `viewer.orders` path
  being rejected at the transport layer by the gateway. Do not reintroduce it; use
  the `orders` resolver.
- **`401 jwt expired`**: the integration token expired and auto-mint is not
  configured. Set `UACAPI_AUTH0_CLIENT_SECRET` (see
  `src/uacapi/integrationToken.ts`) and restart, or paste a fresh
  `UACAPI_INTEGRATION_TOKEN`.
- **"Not available" in dialog**: the order was not in the fetched window
  (`first: 50`) or not owned by the shopper (`order: null`). Increase the window or
  verify `customerNo`.
- **Order found but no tracking link**: the carrier link comes from
  `fulfillmentGroups[].shipment.trackingLink`; unfulfilled orders have no shipment
  yet, so the dialog shows "No tracking is available for this order yet."
- **New detail fields**: add to the GraphQL op + raw types + `mapOrderDetail`
  (backend), then to `OrderDetail` + `sanitizeOrderDetail` (widget) and render in
  `OrderTrackingDrawer`.
```
