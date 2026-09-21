/**
 * The `searchProducts` GraphQL operation used by the read-only MCP tool.
 *
 * We select only the fields required to build our stable MCP output schema.
 * `SearchHit` is a union (`MasterProductSearchHit | SlicingGroupSearchHit`),
 * so inline fragments are used to pull the identifier field from each variant
 * (`style` for masters, `slicedProductId` for slicing groups).
 *
 * The document is a constant. User input (`q`, category, page size) is passed
 * exclusively through GraphQL variables at request time.
 */
export const SEARCH_PRODUCTS_QUERY = /* GraphQL */ `
	query McpSearchProducts($q: String, $first: Int, $refinement: SearchRefinementInput, $sort: String) {
		search(q: $q, first: $first, refinement: $refinement, sort: $sort) {
			totalCount
			count
			pageInfo {
				hasNextPage
				hasPreviousPage
				startCursor
				endCursor
			}
			refinementAttributes {
				attributeId
				label
				values {
					label
					hitCount
					selected
				}
			}
			sortingOptions {
				id
				label
				selected
			}
			edges {
				node {
					... on MasterProductSearchHit {
						id
						style
						productName
						url
						orderable
						currency
						prices {
							list {
								min
								max
							}
							sale {
								min
								max
							}
						}
						colors {
							color
							name
							hex
							orderable
							assets {
								images(
									context: { width: 600, height: 600 }
									viewTypes: ["grid", "gridTileDesktop", "default"]
								) {
									url
									viewType
								}
							}
						}
					}
					... on SlicingGroupSearchHit {
						id
						slicedProductId
						productName
						url
						orderable
						currency
						prices {
							list {
								min
								max
							}
							sale {
								min
								max
							}
						}
						colors {
							color
							name
							hex
							orderable
							assets {
								images(
									context: { width: 600, height: 600 }
									viewTypes: ["grid", "gridTileDesktop", "default"]
								) {
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
`;

/** Variables accepted by {@link SEARCH_PRODUCTS_QUERY}. */
export interface SearchProductsVariables {
	/** Free-text search phrase. */
	q?: string;
	/** Max number of edges to return (maps to the connection `first` argument). */
	first?: number;
	/**
	 * Search refinement passed to UACAPI. Supports category, a sale price range,
	 * and custom attribute refinements (e.g. color group, gender).
	 */
	refinement?: {
		category?: string;
		/** Sale price range; `from` inclusive, `to` exclusive. */
		price?: { from: number; to: number };
		/** Custom attribute refinements, e.g. { attributeId: 'c_colorgroup', values: ['Black'] }. */
		customRefinements?: { attributeId: string; values: string[] }[];
		/**
		 * Hit-type filter. The UA web frontend always requests MASTER + SLICING so
		 * results are product-level (not raw variants), matching the site grid.
		 */
		hitType?: ('MASTER' | 'SLICING')[];
	};
	/** Sort option id (e.g. "top-sellers", "now-trending"); omit for relevance. */
	sort?: string;
}

/* ---------------------------------------------------------------------------
 * Raw response types (as returned by UACAPI). These intentionally mirror the
 * GraphQL schema and are NOT exposed to MCP clients. The mapper converts them
 * into the stable public shape.
 * ------------------------------------------------------------------------- */

interface RawPriceRollup {
	min: number | null;
	max: number | null;
}

interface RawPricesRollup {
	list: RawPriceRollup | null;
	sale: RawPriceRollup | null;
}

interface RawColorVariationAssetDetail {
	url: string | null;
	viewType: string | null;
}

interface RawColorVariationAssets {
	images: RawColorVariationAssetDetail[] | null;
}

interface RawColorVariation {
	color: string | null;
	name: string | null;
	hex: string | null;
	orderable: boolean | null;
	assets: RawColorVariationAssets | null;
}

/** Union member fields we select; optional because they differ per variant. */
export interface RawSearchHitNode {
	id: string | null;
	/** Present on MasterProductSearchHit. */
	style?: string | null;
	/** Present on SlicingGroupSearchHit. */
	slicedProductId?: string | null;
	productName: string | null;
	url: string | null;
	orderable: boolean | null;
	currency: string | null;
	prices: RawPricesRollup | null;
	colors: RawColorVariation[] | null;
}

interface RawSearchProductEdge {
	node: RawSearchHitNode;
}

interface RawPageInfo {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	startCursor: string | null;
	endCursor: string | null;
}

interface RawRefinementAttributeValue {
	label: string;
	hitCount: number;
	selected: boolean;
}

interface RawRefinementAttribute {
	attributeId: string;
	label: string;
	values: RawRefinementAttributeValue[];
}

interface RawSortingOption {
	id: string;
	label: string;
	selected: boolean;
}

export interface RawSearchProductConnection {
	totalCount: number;
	count: number;
	pageInfo: RawPageInfo;
	refinementAttributes: RawRefinementAttribute[];
	sortingOptions: RawSortingOption[];
	edges: RawSearchProductEdge[];
}

/** Top-level shape of the `data` field for {@link SEARCH_PRODUCTS_QUERY}. */
export interface SearchProductsData {
	search: RawSearchProductConnection;
}
