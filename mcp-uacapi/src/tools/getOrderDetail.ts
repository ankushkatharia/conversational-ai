/**
 * Read-only MCP tool: `get_order_detail_by_order_number`.
 *
 * Fetches detail + tracking for a single order by querying the same OIS-backed
 * `orders(input: { siteId, customerNo })` resolver as `get_orders` (with
 * `fulfillmentGroups { shipment { ... } }` added for tracking) and matching on
 * `orderNo`. The order number is the only model-facing input; the
 * site/locale/customerNo and auth are injected server-side via the `auth`
 * passthrough and are never model-facing.
 */

import { z } from 'zod';

import { UacapiClient } from '../uacapi/client.js';
import { requestWithIntegrationToken } from '../uacapi/integrationToken.js';
import {
	GET_ORDER_DETAIL_QUERY,
	GetOrderDetailData,
	GetOrderDetailVariables,
	RawOrderDetailNode,
} from '../uacapi/getOrderDetail.js';

/**
 * Zod schema for the tool input. Only `orderNumber` is model-facing; `auth`
 * carries the server-injected site/locale/token and is stripped from the schema
 * advertised to the LLM.
 */
export const getOrderDetailInputSchema = {
	orderNumber: z
		.string()
		.min(1)
		.describe('The order number (or RMA number) to look up, e.g. "US-DEVNA04-00392564".'),
	auth: z
		.object({
			bearerToken: z.string().optional(),
			siteCode: z.string().optional(),
			languageCode: z.string().optional(),
			customerNo: z.string().optional(),
		})
		.optional()
		.describe('Internal: shopper auth/locale injected by the server; not model-facing.'),
};

/** Inferred TypeScript type for the validated tool input. */
export type GetOrderDetailInput = {
	orderNumber: string;
	/**
	 * Per-request shopper auth + locale, injected by the agent from the HTTP
	 * request (never provided by the LLM).
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

/** A postal address attached to an order. */
export interface OrderAddress {
	firstName: string | null;
	lastName: string | null;
	address1: string | null;
	city: string | null;
	stateCode: string | null;
	postalCode: string | null;
	countryCode: string | null;
}

/** A single shipment with its tracking details. */
export interface OrderShipment {
	trackingNumber: string | null;
	trackingLink: string | null;
	/** Fulfillment status for this group (e.g. "Fulfilled", "In Progress"). */
	status: string | null;
	estimatedDelivery: string | null;
	dateShipped: string | null;
	dateDelivered: string | null;
}

/** The full, stable order-detail payload. */
export interface OrderDetail {
	orderNo: string | null;
	creationDate: string | null;
	status: string | null;
	orderType: string | null;
	currency: string | null;
	totals: OrderTotals | null;
	shippingAddress: OrderAddress | null;
	billingAddress: OrderAddress | null;
	shipments: OrderShipment[];
	items: OrderItem[];
}

/** The payload returned by the tool (order is null when not found). */
export interface GetOrderDetailResult {
	order: OrderDetail | null;
}

/** Desired square image box in pixels (override via UACAPI_IMAGE_SIZE). */
function imageSize(): number {
	const n = Number.parseInt(process.env.UACAPI_IMAGE_SIZE ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : 600;
}

/**
 * Rewrites a Scene7 image URL so the full product fits inside a square box
 * without cropping (mirrors the other order/search tools' normalization).
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

/** Maps a raw UACAPI order node into the stable {@link OrderDetail} shape. */
function mapOrderDetail(node: RawOrderDetailNode): OrderDetail {
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
	// Tracking lives under fulfillmentGroups[].shipment. Keep only groups that
	// actually carry a shipment, and surface status + delivery/ship dates.
	const shipments: OrderShipment[] = (node.fulfillmentGroups ?? [])
		.filter((g) => g.shipment)
		.map((g) => ({
			trackingNumber: g.shipment?.trackingNumber ?? null,
			trackingLink: g.shipment?.trackingLink ?? null,
			status: g.fulfillmentStatus ?? null,
			estimatedDelivery: g.shipment?.estimatedDelivery ?? null,
			dateShipped: g.shipment?.dateShipped ?? null,
			dateDelivered: g.shipment?.dateDelivered ?? null,
		}));
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
		// The `orders` resolver does not expose addresses on the node.
		shippingAddress: null,
		billingAddress: null,
		shipments,
		items,
	};
}

/**
 * Executes the order-detail query against UACAPI and returns the stable result.
 *
 * @param client - the shared UACAPI GraphQL client.
 * @param input - validated tool input (with server-injected `auth`).
 * @returns the mapped, stable order-detail result (`order` is null if not found).
 */
export async function runGetOrderDetail(
	client: UacapiClient,
	input: GetOrderDetailInput,
): Promise<GetOrderDetailResult> {
	// Prefer the per-request injected auth/locale; fall back to the server's
	// static env config so CLI/no-header testing still works.
	const siteId = input.auth?.siteCode ?? process.env.UACAPI_SITE_CODE?.trim();
	const customerNo = input.auth?.customerNo ?? process.env.UACAPI_CUSTOMER_NO?.trim();
	const orderNumber = input.orderNumber?.trim();
	if (!siteId) {
		throw new Error('Missing site context: a site code (e.g. "US"/"CA") is required to fetch an order.');
	}
	if (!customerNo) {
		throw new Error('Missing customer number: cannot fetch order detail without a customerNo.');
	}
	if (!orderNumber) {
		throw new Error('Missing order number: an order number is required to fetch order detail.');
	}

	const contextHeaders: Record<string, string> = {};
	if (input.auth?.siteCode) contextHeaders['ua-site-code'] = input.auth.siteCode;
	if (input.auth?.languageCode) contextHeaders['ua-language-code'] = input.auth.languageCode;

	// Pull a window of the customer's orders (the `orders` resolver has no
	// order-number filter) and match on orderNo. Uses the integration token like
	// get_orders (the shield-gated, proven-working path through UACAPI).
	const variables: GetOrderDetailVariables = {
		first: 50,
		siteId: siteId.toUpperCase(),
		customerNo,
	};

	// eslint-disable-next-line no-console
	console.error(
		`[get_order_detail_by_order_number] -> UACAPI operation "orders" ` +
			`looking for ${orderNumber} (first=${variables.first}, siteId=${variables.siteId})`,
	);

	const data = await requestWithIntegrationToken<GetOrderDetailData>(
		client,
		GET_ORDER_DETAIL_QUERY,
		variables,
		{ contextHeaders },
	);

	const edges = data.orders?.edges ?? [];
	const match = edges.find((e) => e?.node?.orderNo === orderNumber)?.node ?? null;
	return { order: match ? mapOrderDetail(match) : null };
}
