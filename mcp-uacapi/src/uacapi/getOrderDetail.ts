/**
 * The `orders` GraphQL operation backing the read-only
 * `get_order_detail_by_order_number` MCP tool (order tracking).
 *
 * This reuses the same OIS-backed `orders(input: { siteId, customerNo })`
 * resolver as `get_orders` (which authenticates with the integration token and
 * returns the real fulfillment `status`), and additionally selects
 * `fulfillmentGroups { shipment { ... } }` where the tracking number/link and
 * shipment dates live. We page the customer's orders and match on `orderNo`.
 *
 * Note: the OIS, customer-scoped `viewer.orders` path that seabiscuit uses is
 * not reachable through the UACAPI gateway (the request fails at the transport
 * layer), whereas this `orders` resolver is the proven-working path here.
 */
export const GET_ORDER_DETAIL_QUERY = /* GraphQL */ `
	query McpGetOrderDetail($first: Int, $siteId: String!, $customerNo: String!) {
		orders(first: $first, input: { siteId: $siteId, customerNo: $customerNo }) {
			totalCount
			edges {
				node {
					orderNo
					creationDate
					status
					orderType
					currency
					productTotal
					shippingTotal
					taxTotal
					orderTotal
					orderItems {
						fulfillmentStatus
						productItem {
							quantity
							product {
								sku
								copy {
									name
								}
								prices {
									sale
									base
									discount
									total
								}
								assets {
									images(context: { width: 600, height: 600 }) {
										url
										viewType
									}
								}
							}
						}
					}
					fulfillmentGroups {
						type
						fulfillmentStatus
						shipment {
							shipmentId
							trackingNumber
							trackingLink
							estimatedDelivery
							dateShipped
							dateDelivered
						}
					}
				}
			}
		}
	}
`;

/** Variables accepted by {@link GET_ORDER_DETAIL_QUERY}. */
export interface GetOrderDetailVariables {
	/** Page size (maps to the connection `first` argument). */
	first?: number;
	/** The site to query (e.g. "US", "CA"), derived from the shopper's locale. */
	siteId: string;
	/** The shopper's customer number (UUID identity id). */
	customerNo: string;
}

/* ---------------------------------------------------------------------------
 * Raw response types (as returned by UACAPI). These mirror the GraphQL schema
 * and are NOT exposed to MCP clients; the mapper converts them into the stable
 * public shape.
 * ------------------------------------------------------------------------- */

interface RawVariationPrice {
	sale: number | null;
	base: number | null;
	discount: number | null;
	total: number | null;
}

interface RawAssetImage {
	url: string | null;
	viewType: string | null;
}

interface RawVariantProduct {
	sku: string | null;
	copy: { name: string | null } | null;
	prices: RawVariationPrice | null;
	assets: { images: RawAssetImage[] | null } | null;
}

interface RawProductItem {
	quantity: number | null;
	product: RawVariantProduct | null;
}

export interface RawOrderItemNode {
	fulfillmentStatus: string | null;
	productItem: RawProductItem | null;
}

export interface RawShipment {
	shipmentId: string | null;
	trackingNumber: string | null;
	trackingLink: string | null;
	estimatedDelivery: string | null;
	dateShipped: string | null;
	dateDelivered: string | null;
}

export interface RawFulfillmentGroup {
	type: string | null;
	fulfillmentStatus: string | null;
	shipment: RawShipment | null;
}

export interface RawOrderDetailNode {
	orderNo: string | null;
	creationDate: string | null;
	status: string | null;
	orderType: string | null;
	currency: string | null;
	/** Subtotal (sum of product prices before shipping/tax). */
	productTotal: number | null;
	shippingTotal: number | null;
	taxTotal: number | null;
	/** Grand total for the order. */
	orderTotal: number | null;
	orderItems: RawOrderItemNode[] | null;
	/** Per-fulfillment tracking lives here (shipment.trackingNumber/Link). */
	fulfillmentGroups: RawFulfillmentGroup[] | null;
}

interface RawOrderEdge {
	node: RawOrderDetailNode;
}

export interface RawOrderConnection {
	totalCount: number | null;
	edges: RawOrderEdge[] | null;
}

/** Top-level shape of the `data` field for {@link GET_ORDER_DETAIL_QUERY}. */
export interface GetOrderDetailData {
	orders: RawOrderConnection;
}
