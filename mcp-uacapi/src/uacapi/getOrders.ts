/**
 * The `orders` GraphQL operation used by the read-only `get_orders` MCP tool.
 *
 * We select only the fields required to build our stable MCP output schema.
 * User input (`first`, `siteId`, `customerNo`) flows exclusively through GraphQL
 * variables. The scalar variables are referenced inside the inline `input`
 * object so the document stays static and injection-free.
 */
export const GET_ORDERS_QUERY = /* GraphQL */ `
	query McpGetOrders($first: Int, $siteId: String!, $customerNo: String!) {
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
				}
			}
		}
	}
`;

/** Variables accepted by {@link GET_ORDERS_QUERY}. */
export interface GetOrdersVariables {
	/** Max number of orders to return (maps to the connection `first` argument). */
	first?: number;
	/** The site to query (e.g. "US", "CA"), derived from the shopper's locale. */
	siteId: string;
	/** The shopper's customer number. */
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

export interface RawOrderNode {
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
}

interface RawOrderEdge {
	node: RawOrderNode;
}

export interface RawOrderConnection {
	totalCount: number;
	edges: RawOrderEdge[];
}

/** Top-level shape of the `data` field for {@link GET_ORDERS_QUERY}. */
export interface GetOrdersData {
	orders: RawOrderConnection;
}
