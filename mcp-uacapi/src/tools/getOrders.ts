/**
 * Read-only MCP tool: `get_orders`.
 *
 * Returns a shopper's most recent orders. The shopper identity (`customerNo`),
 * the site (`siteId`, derived from locale, e.g. "US"/"CA"), and the bearer
 * token are injected server-side via the `auth` passthrough and are never
 * model-facing. The LLM only controls `limit`.
 */

import { z } from 'zod';

import { UacapiClient } from '../uacapi/client.js';
import { requestWithIntegrationToken } from '../uacapi/integrationToken.js';
import { GET_ORDERS_QUERY, GetOrdersData, GetOrdersVariables, RawOrderNode } from '../uacapi/getOrders.js';

/** Default number of recent orders to return. */
const DEFAULT_LIMIT = 3;
/** Upper bound on the number of orders to protect UACAPI from expensive queries. */
const MAX_LIMIT = 50;

/**
 * Zod schema for the tool input. Only `limit` is model-facing; `auth` carries
 * the server-injected shopper identity + locale and is stripped from the schema
 * advertised to the LLM.
 */
export const getOrdersInputSchema = {
	limit: z
		.number()
		.int()
		.min(1)
		.max(MAX_LIMIT)
		.optional()
		.describe(`Number of most recent orders to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`),
	auth: z
		.object({
			bearerToken: z.string().optional(),
			siteCode: z.string().optional(),
			languageCode: z.string().optional(),
			customerNo: z.string().optional(),
		})
		.optional()
		.describe('Internal: shopper auth/locale/customerNo injected by the server; not model-facing.'),
};

/** Inferred TypeScript type for the validated tool input. */
export type GetOrdersInput = {
	limit?: number;
	/**
	 * Per-request shopper auth + locale + customerNo, injected by the agent from
	 * the HTTP request (never provided by the LLM).
	 */
	auth?: {
		bearerToken?: string;
		siteCode?: string;
		languageCode?: string;
		customerNo?: string;
	};
};

/* ---------------------------------------------------------------------------
 * Stable MCP output schema. Decoupled from the UACAPI GraphQL types.
 * ------------------------------------------------------------------------- */

/** Monetary totals for an order. */
export interface OrderTotals {
	subtotal: number | null;
	shipping: number | null;
	tax: number | null;
	grandTotal: number | null;
	discount: number | null;
}

/** A single line item within an order. */
export interface OrderItem {
	name: string | null;
	sku: string | null;
	quantity: number | null;
	price: number | null;
	fulfillmentStatus: string | null;
	/** Ready-to-render product image URL for this line item. */
	imageUrl: string | null;
}

/** A single order in the stable output. */
export interface Order {
	orderNo: string | null;
	creationDate: string | null;
	status: string | null;
	orderType: string | null;
	currency: string | null;
	totals: OrderTotals | null;
	items: OrderItem[];
}

/** The full, stable payload returned by the tool. */
export interface GetOrdersResult {
	totalCount: number;
	count: number;
	orders: Order[];
}

/** Desired square image box in pixels (override via UACAPI_IMAGE_SIZE). */
function imageSize(): number {
	const n = Number.parseInt(process.env.UACAPI_IMAGE_SIZE ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : 600;
}

/**
 * Rewrites a Scene7 image URL so the full product fits inside a square box
 * without cropping (mirrors the product-search tool's normalization).
 */
function normalizeImageUrl(url: string | null): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		const size = imageSize();
		u.searchParams.delete('rp');
		u.searchParams.delete('scl');
		u.searchParams.delete('size');
		u.searchParams.set('wid', String(size));
		u.searchParams.set('hei', String(size));
		u.searchParams.set('fit', 'constrain');
		u.searchParams.set('bgc', 'FFFFFF');
		return u.toString();
	} catch {
		return url;
	}
}

/** Picks a single display image URL, preferring the full-product "default" view. */
function pickImageUrl(images: { url: string | null; viewType: string | null }[] | null): string | null {
	if (!images || images.length === 0) return null;
	for (const viewType of ['default', 'gridTileDesktop', 'grid']) {
		const match = images.find((img) => img.viewType === viewType && img.url);
		if (match?.url) return normalizeImageUrl(match.url);
	}
	const first = images.find((img) => img.url)?.url ?? null;
	return normalizeImageUrl(first);
}

/** Maps a raw UACAPI order node into the stable {@link Order} shape. */
function mapOrder(node: RawOrderNode): Order {
	const items: OrderItem[] = (node.orderItems ?? []).map((item) => {
		const product = item.productItem?.product ?? null;
		return {
			name: product?.copy?.name ?? null,
			sku: product?.sku ?? null,
			quantity: item.productItem?.quantity ?? null,
			price: product?.prices?.sale ?? product?.prices?.base ?? null,
			fulfillmentStatus: item.fulfillmentStatus ?? null,
			imageUrl: pickImageUrl(product?.assets?.images ?? null),
		};
	});
	// Sum per-item discounts for an order-level discount (no direct field exists).
	const discount = (node.orderItems ?? []).reduce((sum, item) => {
		const d = item.productItem?.product?.prices?.discount;
		return sum + (typeof d === 'number' ? d : 0);
	}, 0);
	return {
		orderNo: node.orderNo ?? null,
		creationDate: node.creationDate ?? null,
		status: node.status ?? null,
		orderType: node.orderType ?? null,
		currency: node.currency ?? null,
		totals: {
			subtotal: node.productTotal ?? null,
			shipping: node.shippingTotal ?? null,
			tax: node.taxTotal ?? null,
			grandTotal: node.orderTotal ?? null,
			discount: items.length > 0 ? discount : null,
		},
		items,
	};
}

/**
 * Executes the orders query against UACAPI and returns the stable result.
 *
 * @param client - the shared UACAPI GraphQL client.
 * @param input - validated tool input (with server-injected `auth`).
 * @returns the mapped, stable orders result.
 */
export async function runGetOrders(
	client: UacapiClient,
	input: GetOrdersInput,
): Promise<GetOrdersResult> {
	// Prefer the per-request injected auth/locale; fall back to the server's
	// static env config so CLI/no-header testing still works.
	const siteId = input.auth?.siteCode ?? process.env.UACAPI_SITE_CODE?.trim();
	const customerNo = input.auth?.customerNo ?? process.env.UACAPI_CUSTOMER_NO?.trim();
	if (!siteId) {
		throw new Error('Missing site context: a site code (e.g. "US"/"CA") is required to fetch orders.');
	}
	if (!customerNo) {
		throw new Error('Missing customer number: cannot fetch orders without a customerNo.');
	}

	const variables: GetOrdersVariables = {
		first: input.limit ?? DEFAULT_LIMIT,
		siteId,
		customerNo,
	};

	// eslint-disable-next-line no-console
	console.error(
		`[get_orders] -> UACAPI operation "orders" variables: ${JSON.stringify({
			first: variables.first,
			siteId: variables.siteId,
		})}`,
	);

	const contextHeaders: Record<string, string> = {};
	if (input.auth?.siteCode) contextHeaders['ua-site-code'] = input.auth.siteCode;
	if (input.auth?.languageCode) contextHeaders['ua-language-code'] = input.auth.languageCode;

	// The `orders` query is shield-gated to INTEGRATION (machine) tokens; a
	// per-shopper registered token is rejected with "Must have an integration
	// token". The token manager mints/refreshes an Auth0 client-credentials token
	// (or uses the static UACAPI_INTEGRATION_TOKEN) and retries once on 401.
	const data = await requestWithIntegrationToken<GetOrdersData>(client, GET_ORDERS_QUERY, variables, {
		contextHeaders,
	});
	const connection = data.orders;

	const orders = connection.edges.map((edge) => mapOrder(edge.node));
	return {
		totalCount: connection.totalCount,
		count: orders.length,
		orders,
	};
}
