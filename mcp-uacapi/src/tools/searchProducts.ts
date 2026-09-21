/**
 * Read-only MCP tool: `search_products`.
 *
 * Responsibilities:
 * - Declare the tool input schema (query, categoryId, limit) using zod.
 * - Enforce validation rules that GraphQL alone cannot express (e.g. "at least
 *   one of query or categoryId must be provided").
 * - Call UACAPI via the shared client using GraphQL variables.
 * - Map the raw GraphQL connection into a stable, documented output shape so
 *   MCP clients are insulated from UACAPI schema changes.
 */

import { z } from 'zod';

import { UacapiClient } from '../uacapi/client.js';
import {
	RawSearchHitNode,
	SEARCH_PRODUCTS_QUERY,
	SearchProductsData,
	SearchProductsVariables,
} from '../uacapi/searchProducts.js';

/** Default page size when the caller does not specify `limit`. */
const DEFAULT_LIMIT = 20;
/** Upper bound on page size to protect UACAPI from expensive queries. */
const MAX_LIMIT = 100;

/**
 * Zod schema for the tool input. The MCP SDK uses this to advertise the input
 * schema to clients and to parse/validate incoming arguments.
 *
 * Both `query` and `categoryId` are individually optional; the cross-field
 * rule ("at least one must be present") is enforced in {@link validateInput}
 * because it depends on the combination of fields.
 */
export const searchProductsInputSchema = {
	query: z
		.string()
		.trim()
		.min(1, 'query must not be empty when provided')
		.optional()
		.describe('Free-text search phrase, e.g. "running shoes".'),
	categoryId: z
		.string()
		.trim()
		.min(1, 'categoryId must not be empty when provided')
		.optional()
		.describe('UACAPI category id to refine results, e.g. "mens-shoes".'),
	limit: z
		.number()
		.int()
		.min(1)
		.max(MAX_LIMIT)
		.optional()
		.describe(`Max number of products to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`),
	sort: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			'Sort option id. Omit for relevance (note: relevance can rank loosely-matching ' +
				'items first). Common ids: "now-trending", "top-sellers", "top-rated", "newest", ' +
				'"price-low-high", "price-high-low".',
		),
	minPrice: z
		.number()
		.min(0)
		.optional()
		.describe('Minimum sale price (inclusive), e.g. 25 for "over $25".'),
	maxPrice: z
		.number()
		.min(0)
		.optional()
		.describe('Maximum sale price (exclusive), e.g. 100 for "under $100".'),
	color: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			'Color group filter. One of: Black, Blue, Brown, Gold, Gray, Green, Maroon, Navy, ' +
				'Orange, Pink, Purple, Red, Silver, White, Yellow, Camo, Assorted.',
		),
	gender: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe('Gender filter. One of: Mens, Womens, Boys, Girls, Unisex.'),
	reset: z
		.boolean()
		.optional()
		.describe(
			'Set true only when the user starts a brand-new search for a different product ' +
				'type; this clears previously applied filters (price/color/gender). Leave unset ' +
				'when refining the current search.',
		),
};

/** Inferred TypeScript type for the validated tool input. */
export type SearchProductsInput = {
	query?: string;
	categoryId?: string;
	limit?: number;
	sort?: string;
	minPrice?: number;
	maxPrice?: number;
	color?: string;
	gender?: string;
	/** Agent-level hint to clear accumulated filters; ignored by the tool itself. */
	reset?: boolean;
};

/** UACAPI attribute id for the color-group refinement. */
const COLOR_GROUP_ATTRIBUTE_ID = 'c_colorgroup';
/** UACAPI attribute id for the gender refinement. */
const GENDER_ATTRIBUTE_ID = 'c_gender';
/** UACAPI attribute id for the price refinement. */
const PRICE_ATTRIBUTE_ID = 'price';
/** Custom refinement the UA web frontend always sends: only orderable products. */
const ORDERABLE_ONLY_ATTRIBUTE_ID = 'orderable_only';
/** Upper bound used when only a minPrice is provided (UACAPI price range end). */
const PRICE_RANGE_MAX = 9999;
/** Max chip values kept per refinement group (top by hit count). */
const MAX_CHIPS_PER_GROUP = 6;

/** Canonical color-group values accepted by UACAPI (Title case). */
const COLOR_GROUPS = [
	'Black',
	'Blue',
	'Brown',
	'Gold',
	'Gray',
	'Green',
	'Maroon',
	'Navy',
	'Orange',
	'Pink',
	'Purple',
	'Red',
	'Silver',
	'White',
	'Yellow',
	'Camo',
	'Assorted',
];

/** Canonical gender values accepted by UACAPI. */
const GENDERS = ['Mens', 'Womens', 'Boys', 'Girls', 'Unisex'];

/**
 * Normalizes a free-form value to one of the allowed canonical values
 * (case-insensitive). Returns the canonical value, or the trimmed input if no
 * match (so UACAPI can still attempt the refinement).
 */
function canonicalize(value: string, allowed: string[]): string {
	const v = value.trim();
	const match = allowed.find((a) => a.toLowerCase() === v.toLowerCase());
	return match ?? v;
}

/* ---------------------------------------------------------------------------
 * Stable MCP output schema. This is the contract we expose to MCP clients.
 * It is deliberately decoupled from the UACAPI GraphQL types.
 * ------------------------------------------------------------------------- */

/** A price band (min/max) in the product's currency. */
export interface PriceBand {
	min: number | null;
	max: number | null;
}

/** List and sale price bands for a product. */
export interface ProductPrice {
	list: PriceBand | null;
	sale: PriceBand | null;
}

/** A single color variation of a product. */
export interface ProductColor {
	code: string | null;
	name: string | null;
	hex: string | null;
	orderable: boolean | null;
	/** Ready-to-render image URL for this color (Scene7, 400x400 default view). */
	imageUrl: string | null;
}

/** A single product in the stable output. */
export interface Product {
	id: string | null;
	style: string | null;
	name: string | null;
	url: string | null;
	orderable: boolean | null;
	currency: string | null;
	price: ProductPrice | null;
	/** Primary image URL (first available color image) for quick display. */
	imageUrl: string | null;
	colors: ProductColor[];
}

/**
 * One clickable quick-reply value. `delta` is the exact set of tool/search
 * arguments the UI should apply (merged over current filters) when tapped.
 */
export interface RefinementValue {
	label: string;
	count: number;
	selected: boolean;
	delta: Partial<SearchProductsInput>;
}

/** A group of chips for a single facet (Color, Gender, Price). */
export interface RefinementGroup {
	/** UACAPI attribute id, e.g. "c_colorgroup". */
	attributeId: string;
	/** Localized facet label, e.g. "Color". */
	label: string;
	/** The tool input field this facet maps to ("color" | "gender" | "price"). */
	field: 'color' | 'gender' | 'price';
	values: RefinementValue[];
}

/** A clickable sort option. */
export interface SortSuggestion {
	id: string;
	label: string;
	selected: boolean;
	delta: Partial<SearchProductsInput>;
}

/** Dynamic quick-reply chips derived from the live UACAPI refinements. */
export interface SearchSuggestions {
	refinements: RefinementGroup[];
	sorts: SortSuggestion[];
}

/** The full, stable payload returned by the tool. */
export interface SearchProductsResult {
	totalCount: number;
	count: number;
	pageInfo: {
		hasNextPage: boolean;
		hasPreviousPage: boolean;
		startCursor: string | null;
		endCursor: string | null;
	};
	products: Product[];
	/** Dynamic quick-reply chips (color/gender/price/sort) for guided refinement. */
	suggestions: SearchSuggestions;
}

/**
 * Applies cross-field validation that the per-field zod schema cannot express.
 *
 * @param input - the already field-validated input.
 * @throws {Error} when neither `query` nor `categoryId` is provided.
 */
export function validateInput(input: SearchProductsInput): void {
	if (!input.query && !input.categoryId) {
		throw new Error('At least one of "query" or "categoryId" must be provided.');
	}
}

/**
 * Maps a raw UACAPI search hit node into the stable {@link Product} shape.
 *
 * `style` is normalized across the union: master hits expose `style`, slicing
 * group hits expose `slicedProductId`.
 */
function mapProduct(node: RawSearchHitNode): Product {
	const prices = node.prices;
	const colors = (node.colors ?? []).map((c) => ({
		code: c.color ?? null,
		name: c.name ?? null,
		hex: c.hex ?? null,
		orderable: c.orderable ?? null,
		imageUrl: pickImageUrl(c.assets?.images ?? null),
	}));
	return {
		id: node.id ?? null,
		style: node.style ?? node.slicedProductId ?? null,
		name: node.productName ?? null,
		url: node.url ?? null,
		orderable: node.orderable ?? null,
		currency: node.currency ?? null,
		price: prices
			? {
					list: prices.list ? { min: prices.list.min, max: prices.list.max } : null,
					sale: prices.sale ? { min: prices.sale.min, max: prices.sale.max } : null,
			  }
			: null,
		// Convenience: first color that has an image.
		imageUrl: colors.find((c) => c.imageUrl)?.imageUrl ?? null,
		colors,
	};
}

/**
 * Picks a single display image URL from a color's asset images.
 *
 * Prefers the "default" view type, then falls back to the first image with a
 * non-empty URL.
 */
function pickImageUrl(
	images: { url: string | null; viewType: string | null }[] | null,
): string | null {
	if (!images || images.length === 0) return null;
	// Prefer the full-product "default" view (true aspect ratio) over the square
	// marketing tiles, then fall back to any image.
	for (const viewType of ['default', 'gridTileDesktop', 'grid']) {
		const match = images.find((img) => img.viewType === viewType && img.url);
		if (match?.url) return normalizeImageUrl(match.url);
	}
	const first = images.find((img) => img.url)?.url ?? null;
	return normalizeImageUrl(first);
}

/** Desired square image box in pixels (override via UACAPI_IMAGE_SIZE). */
function imageSize(): number {
	const n = Number.parseInt(process.env.UACAPI_IMAGE_SIZE ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : 600;
}

/**
 * Rewrites a Scene7 image URL so the FULL product fits inside a square box
 * without cropping.
 *
 * Scene7's `scl=1` (and named `rp` recipes) force a fixed square output that
 * square-crops the product. Removing them lets `fit=constrain` fit the whole
 * image within `wid`x`hei` while preserving aspect ratio; `bgc=FFFFFF`
 * letterboxes any empty space in white so it blends into a card. The original
 * path/asset is preserved.
 */
function normalizeImageUrl(url: string | null): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		const size = imageSize();
		// Drop directives that force a fixed square crop/pad (rp recipe, scl scale,
		// and the fixed size), so fit=constrain governs sizing.
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

/**
 * Parses a UACAPI price refinement label into a {minPrice, maxPrice} delta.
 *
 * Handles the observed label formats: "Under $25", "$25 - $50", "$200 +".
 * Returns null when no numbers can be extracted.
 */
function parsePriceLabel(label: string): Partial<SearchProductsInput> | null {
	const nums = (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
	if (nums.length === 0) return null;
	const lower = label.toLowerCase();
	if (nums.length >= 2) return { minPrice: nums[0], maxPrice: nums[1] };
	// Single number: decide from wording.
	if (/(under|below|less|up to|<)/.test(lower)) return { maxPrice: nums[0] };
	if (/(\+|over|above|more|and up|>)/.test(label)) return { minPrice: nums[0] };
	return { maxPrice: nums[0] };
}

/**
 * Maps live UACAPI refinements + sort options into stable, chip-friendly
 * suggestions. Only facets the tool can act on are surfaced (Color, Gender,
 * Price), each value carrying the exact `delta` args to apply when clicked.
 */
function buildSuggestions(connection: SearchProductsData['search']): SearchSuggestions {
	const refinements: RefinementGroup[] = [];

	for (const attr of connection.refinementAttributes ?? []) {
		let field: RefinementGroup['field'] | null = null;
		if (attr.attributeId === COLOR_GROUP_ATTRIBUTE_ID) field = 'color';
		else if (attr.attributeId === GENDER_ATTRIBUTE_ID) field = 'gender';
		else if (attr.attributeId === PRICE_ATTRIBUTE_ID) field = 'price';
		if (!field) continue;

		const values: RefinementValue[] = [];
		for (const v of attr.values) {
			let delta: Partial<SearchProductsInput> | null = null;
			if (field === 'color') delta = { color: v.label };
			else if (field === 'gender') delta = { gender: v.label };
			else if (field === 'price') delta = parsePriceLabel(v.label);
			if (!delta) continue;
			values.push({ label: v.label, count: v.hitCount, selected: v.selected, delta });
		}

		if (values.length === 0) continue;
		values.sort((a, b) => b.count - a.count);
		refinements.push({
			attributeId: attr.attributeId,
			label: attr.label,
			field,
			values: values.slice(0, MAX_CHIPS_PER_GROUP),
		});
	}

	const sorts: SortSuggestion[] = (connection.sortingOptions ?? []).map((s) => ({
		id: s.id,
		label: s.label,
		selected: s.selected,
		delta: { sort: s.id },
	}));

	return { refinements, sorts };
}

/**
 * Executes the product search against UACAPI and returns the stable result.
 *
 * @param client - the shared UACAPI GraphQL client.
 * @param input - validated tool input.
 * @returns the mapped, stable search result.
 */
export async function runSearchProducts(
	client: UacapiClient,
	input: SearchProductsInput,
): Promise<SearchProductsResult> {
	validateInput(input);

	// Build the structured refinement (category + price range + color/gender).
	// Match the UA web frontend defaults so results are the same accurate,
	// purchasable, product-level set the site shows: only orderable products.
	const customRefinements: { attributeId: string; values: string[] }[] = [
		{ attributeId: ORDERABLE_ONLY_ATTRIBUTE_ID, values: ['true'] },
	];
	if (input.color) {
		customRefinements.push({
			attributeId: COLOR_GROUP_ATTRIBUTE_ID,
			values: [canonicalize(input.color, COLOR_GROUPS)],
		});
	}
	if (input.gender) {
		customRefinements.push({
			attributeId: GENDER_ATTRIBUTE_ID,
			values: [canonicalize(input.gender, GENDERS)],
		});
	}

	const hasPrice = input.minPrice !== undefined || input.maxPrice !== undefined;
	const refinement: NonNullable<SearchProductsVariables['refinement']> = {
		// The UA web frontend always requests product-level hits (master + slicing
		// group) rather than raw variants; mirror that for parity with the site.
		hitType: ['MASTER', 'SLICING'],
	};
	if (input.categoryId) refinement.category = input.categoryId;
	if (hasPrice) {
		refinement.price = {
			from: input.minPrice ?? 0,
			to: input.maxPrice ?? PRICE_RANGE_MAX,
		};
	}
	refinement.customRefinements = customRefinements;

	// Build GraphQL variables (never string-concatenated into the query).
	const variables: SearchProductsVariables = {
		q: input.query,
		first: input.limit ?? DEFAULT_LIMIT,
		refinement: Object.keys(refinement).length > 0 ? refinement : undefined,
		sort: input.sort,
	};

	// Trace the exact operation + variables sent to UACAPI (the GraphQL "body").
	// The query document itself is the static `search(...)` operation below.
	// eslint-disable-next-line no-console
	console.error(
		`[search_products] -> UACAPI operation "search" variables: ${JSON.stringify(variables)}`,
	);

	const data = await client.request<SearchProductsData>(SEARCH_PRODUCTS_QUERY, variables);
	const connection = data.search;

	return {
		totalCount: connection.totalCount,
		count: connection.count,
		pageInfo: {
			hasNextPage: connection.pageInfo.hasNextPage,
			hasPreviousPage: connection.pageInfo.hasPreviousPage,
			startCursor: connection.pageInfo.startCursor ?? null,
			endCursor: connection.pageInfo.endCursor ?? null,
		},
		products: connection.edges.map((edge) => mapProduct(edge.node)),
		suggestions: buildSuggestions(connection),
	};
}
