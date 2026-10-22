/**
 * Model + MCP agent.
 *
 * Connects the OpenAI-compatible model (AWS Bedrock gpt-oss) to the local
 * UACAPI MCP server and runs a tool-calling loop:
 *
 *   1. Spawn the MCP server (`dist/index.js`) over stdio and list its tools.
 *   2. Expose those tools to the model as OpenAI function tools.
 *   3. Send the user's prompt. Whenever the model requests a tool call, run it
 *      through the MCP client, feed the result back, and repeat until the model
 *      returns a final natural-language answer.
 *
 * Exposed as a reusable factory (`createAgent`) so both the CLI (bottom of this
 * file) and the HTTP API (`http.ts`) share one connected MCP client.
 *
 * CLI usage:
 *   node dist/agent.js "find me mens running shoes under $120"
 */

import { fileURLToPath } from 'node:url';

import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import OpenAI from 'openai';
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from 'openai/resources/chat/completions';

import type { Product, SearchSuggestions } from './tools/searchProducts.js';
import type { Order } from './tools/getOrders.js';
import type { OrderDetail } from './tools/getOrderDetail.js';

/** OpenAI/Bedrock credentials resolved from the .env file (fresh) or env. */
interface OpenAiCredentials {
	apiKey: string;
	baseURL: string;
	/** Where the values came from, for troubleshooting. */
	source: string;
}

/**
 * Resolves OpenAI credentials, preferring the current contents of the `.env`
 * file over the process environment.
 *
 * Why read the file directly: `process.loadEnvFile` does not override vars that
 * are already set, and a long-running server captures env at startup. Reading
 * the file per request lets you refresh an expired Bedrock token in `.env`
 * without restarting the server.
 */
function resolveOpenAiCredentials(): OpenAiCredentials {
	// Candidate .env locations: project root (relative to dist/agent.js) and cwd.
	const here = fileURLToPath(new URL('.', import.meta.url));
	const candidates = [`${here}../.env`, `${process.cwd()}/.env`];

	let fromFile: Record<string, string> = {};
	let envPath = '(none)';
	for (const path of candidates) {
		if (existsSync(path)) {
			envPath = path;
			try {
				fromFile = parseEnv(readFileSync(path, 'utf8')) as Record<string, string>;
			} catch {
				fromFile = {};
			}
			break;
		}
	}

	const keyFromFile = fromFile.OPENAI_API_KEY !== undefined;
	const rawApiKey = fromFile.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
	const apiKey = rawApiKey.trim();
	const baseURL = (fromFile.OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? '').trim();
	if (!apiKey || !baseURL) {
		throw new Error('OPENAI_API_KEY and OPENAI_BASE_URL must be set (see .env).');
	}

	// Troubleshooting diagnostics (never prints the token itself).
	// eslint-disable-next-line no-console
	console.error(
		`[agent] creds: source=${keyFromFile ? envPath : 'process.env'} ` +
			`keyLen=${apiKey.length} ` +
			`keyPrefix=${apiKey.slice(0, 4)} keyEnd=${apiKey.slice(-4)} ` +
			`hasInnerWhitespace=${/\s/.test(apiKey)} ` +
			`trimmedChars=${rawApiKey.length - apiKey.length} ` +
			`baseURL=${baseURL} model=${MODEL}`,
	);

	return { apiKey, baseURL, source: keyFromFile ? envPath : 'process.env' };
}

const MODEL = process.env.OPENAI_MODEL ?? 'openai.gpt-oss-120b';
const MAX_TURNS = 8;
/**
 * Hard cap on tool executions per request. Once reached we force a text-only
 * answer so the model summarizes what it has instead of looping forever.
 */
const MAX_TOOL_CALLS = 3;
/** Max prior conversation turns to include as context (bounds token usage). */
const MAX_HISTORY_TURNS = 8;
/** Max characters kept from a prior assistant turn (answers can be large). */
const MAX_ASSISTANT_CHARS = 800;

/**
 * System prompt: defines the assistant's role and how to use the search tool.
 * Kept explicit so the model reliably calls the tool and does not invent data.
 */
const SYSTEM_PROMPT = [
	'You are the Under Armour shopping assistant.',
	'You help shoppers find products from the Under Armour catalog.',
	'',
	'Use STRUCTURED filters, not free text, for constraints:',
	'- Put the product type in `query` (e.g. "training shoes").',
	'- Price: use `minPrice`/`maxPrice` (e.g. "under $100" -> maxPrice: 100).',
	'- Color: use `color` (e.g. "black" -> color: "Black"). Allowed: Black, Blue,',
	'  Brown, Gold, Gray, Green, Maroon, Navy, Orange, Pink, Purple, Red, Silver,',
	'  White, Yellow, Camo, Assorted.',
	'- Gender: use `gender` (Mens, Womens, Boys, Girls, Unisex).',
	'- Do NOT jam price/color/gender into the `query` string; use the fields.',
	'',
	'Conversation refinements (CRITICAL):',
	'- The server automatically REMEMBERS and MERGES filters across turns. On a',
	'  follow-up, pass ONLY the new/changed field(s). Example: after "training',
	'  shoes", the message "under $100" -> call with just { maxPrice: 100 }; then',
	'  "only black" -> call with just { color: "Black" }. The server keeps the',
	'  earlier query and price automatically.',
	'- Do NOT resend or change `query` on a pure refinement; never replace it with a',
	'  generic/brand term. The product type must stay the same across refinements.',
	'- Only when the user clearly asks for a DIFFERENT product type, call with the',
	'  new `query` AND set `reset: true` to clear the old price/color/gender filters.',
	'',
	'Tool usage rules:',
	'- For any request to find, browse, compare, or check products, call the',
	'  `search_products` tool. Never invent products, prices, styles, URLs, or',
	'  availability. Use only data returned by the tool.',
	'- Prefer the free-text `query` for intent (e.g. "mens running shoes"). Do NOT',
	'  guess `categoryId` values; only use `categoryId` if the user gives an exact',
	'  category id. Guessed category ids usually return zero results.',
	'- Always pass `sort` for generic searches ("top-sellers" or "now-trending"),',
	'  because raw relevance can rank loosely-matching items (e.g. socks) first.',
	'  Use "price-low-high"/"price-high-low" for price intent, "newest" for new',
	'  arrivals, "top-rated" for quality.',
	'- Result count: if the user asks for a specific number (e.g. "top 5", "show 20"),',
	'  use that as `limit`. Otherwise DEFAULT to `limit` = 20 (show at least 20).',
	'',
	'Order history (get_orders tool):',
	'- When the shopper asks about their past orders, order history, recent',
	'  purchases, or "my last N orders", call the `get_orders` tool.',
	'- Pass `limit` = the number of orders requested (e.g. "last 3 orders" ->',
	'  limit: 3). If no number is given, default to 3.',
	'- The server injects the shopper identity (customer number) and site/locale;',
	'  never ask the user for a customer number and never invent orders. Use only',
	'  data returned by the tool.',
	'- Summarize the returned orders briefly in natural language (e.g. order number,',
	'  date, status, and total). If none are returned, say so in one sentence.',
	'',
	'Order tracking (get_order_detail_by_order_number tool):',
	'- When the shopper asks to TRACK an order, where their order/package is, or for',
	'  tracking info/number for a specific order, call the',
	'  `get_order_detail_by_order_number` tool.',
	'- Pass `orderNumber` = the exact order (or RMA) number from the user\'s message',
	'  (e.g. "US-DEVNA04-00392564" or "00392564"). Do NOT guess an order number.',
	'- If the user wants to track an order but did NOT provide an order number, call',
	'  `get_orders` instead so they can pick from their recent orders (the app shows',
	'  a clickable list plus an order-number box). Do not ask for the number in text.',
	'- The server injects the site/locale and auth; never ask for a site or token.',
	'- Summarize the order status and, when present, the tracking number(s) and',
	'  tracking link(s) in a short natural-language reply. If the order is not found',
	'  (null), say so plainly in one sentence.',
	'',
	'Stopping rules (important):',
	'- Call `search_products` at most twice per user request.',
	'- As soon as a call returns one or more products, STOP calling tools and write',
	'  your final answer using those results. Do not keep refining.',
	'- If a call returns zero products, you may retry ONCE with a broader `query`.',
	'  If it is still empty, tell the user plainly and suggest how to refine.',
	'- Call `get_orders` at most ONCE per user request. It takes only `limit` (do',
	'  NOT pass site/locale/customerNo; the server injects those). After it returns,',
	'  STOP calling tools and write your answer. If it returns an error or zero',
	'  orders, tell the user plainly in one sentence; do NOT retry it.',
	'- Call `get_order_detail_by_order_number` at most ONCE per user request. It',
	'  takes only `orderNumber` (the server injects site/locale/auth). After it',
	'  returns, STOP calling tools and write your answer. If the order is null or it',
	'  errors, tell the user plainly in one sentence; do NOT retry it.',
	'',
	'Presentation (CRITICAL): the app renders the product CARDS itself from',
	'structured data. Your text reply must be ONLY a short conversational sentence',
	'and NOTHING else. Specifically:',
	'- Reply with ONE short sentence, e.g. "Here are some trendy t-shirts:" or',
	'  "Here are black training shoes under $100:".',
	'- Do NOT list the products. Do NOT include product names, styles, prices, URLs,',
	'  images, markdown images, bullet lists, headings, or tables. No "|" characters.',
	'- You may optionally add one brief follow-up line (e.g. "Want to filter by',
	'  color or price?"). Never output the product details themselves.',
	'- If no products are found, say so in one sentence and suggest how to refine.',
].join('\n');

/** MCP tool descriptor subset we rely on. */
interface McpToolDescriptor {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

/**
 * Accumulated, structured search filters that persist across conversation turns.
 * Each turn merges the model's delta onto this state so refinements are
 * deterministic (not dependent on the model re-remembering everything).
 */
export interface SearchFilterState {
	query?: string;
	categoryId?: string;
	minPrice?: number;
	maxPrice?: number;
	color?: string;
	gender?: string;
	sort?: string;
	limit?: number;
}

/** Filter keys we carry across turns (excludes the transient `reset` flag). */
const FILTER_KEYS: (keyof SearchFilterState)[] = [
	'query',
	'categoryId',
	'minPrice',
	'maxPrice',
	'color',
	'gender',
	'sort',
	'limit',
];

/**
 * Merges a model-proposed delta onto the base filter state. Only keys the model
 * actually provided (non-empty) override; everything else persists.
 *
 * Exported for testing; used internally by the tool-call interception loop.
 */
export function mergeFilters(
	base: SearchFilterState,
	delta: Record<string, unknown>,
): SearchFilterState {
	const merged: SearchFilterState = { ...base };
	for (const key of FILTER_KEYS) {
		const value = delta[key];
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(merged as any)[key] = value;
	}
	return merged;
}

/** Result of a single agent run. */
export interface AgentRunResult {
	/** Final natural-language answer from the model (conversational text only). */
	answer: string;
	/**
	 * Structured products from the last successful search, for the UI to render
	 * consistent product cards (do NOT rely on parsing `answer` markdown).
	 */
	products: Product[];
	/**
	 * Dynamic quick-reply chips (color/gender/price/sort) from the last search,
	 * each carrying a `delta` the UI can apply as a follow-up refinement.
	 */
	suggestions: SearchSuggestions;
	/** Structured orders from the last successful `get_orders` call, for the UI. */
	orders: Order[];
	/**
	 * Structured order detail (with tracking) from the last successful
	 * `get_order_detail_by_order_number` call, for the UI. Null when not fetched
	 * or not found.
	 */
	orderDetail: OrderDetail | null;
	/** Tool calls the model made, in order (for debugging/telemetry). */
	toolCalls: { name: string; arguments: unknown }[];
	/** Accumulated structured filter state after this run (for session persistence). */
	filters: SearchFilterState;
}

/** One prior conversation turn passed as context. */
export interface ChatTurn {
	role: 'user' | 'assistant';
	content: string;
}

/**
 * Per-request shopper auth + locale, derived from the HTTP request headers by
 * `http.ts` (Authorization + x-ua-locale). It is injected into each MCP tool
 * call so UACAPI runs as the current shopper (guest or logged-in) and locale.
 * It is deliberately kept out of the LLM-facing tool schema and all telemetry
 * so the bearer token is never sent to the model or logged.
 */
export interface RequestAuthContext {
	bearerToken?: string;
	siteCode?: string;
	languageCode?: string;
	/** Shopper's customer number, used by order-history tools (e.g. get_orders). */
	customerNo?: string;
}

/** A connected agent with a shared MCP client + model client. */
export interface Agent {
	/**
	 * Runs the tool-calling loop for a single user prompt, with optional prior
	 * turns and an accumulated structured filter state that is merged with each
	 * `search_products` call and returned for session persistence.
	 */
	runAgent(
		prompt: string,
		history?: ChatTurn[],
		initialFilters?: SearchFilterState,
		auth?: RequestAuthContext,
	): Promise<AgentRunResult>;
	/** Calls an MCP tool directly (no LLM); returns the tool result payload. */
	callTool(name: string, args: Record<string, unknown>, auth?: RequestAuthContext): Promise<unknown>;
	/** Shuts down the MCP server connection. */
	close(): Promise<void>;
}

/** Converts MCP tool definitions into OpenAI chat "function" tools. */
function toOpenAITools(mcpTools: McpToolDescriptor[]): ChatCompletionTool[] {
	return mcpTools.map((tool) => {
		// OpenAI expects a plain JSON Schema in `parameters`; drop the `$schema`
		// meta key some generators include.
		const parameters: Record<string, unknown> = {
			...(tool.inputSchema ?? { type: 'object', properties: {} }),
		};
		delete parameters.$schema;
		// `auth` is a server-injected passthrough (shopper token + locale), not a
		// model input. Hide it from the LLM so it never sees or tries to fill it;
		// the agent injects it directly at the mcp.callTool boundary instead.
		if (parameters.properties && typeof parameters.properties === 'object') {
			const properties = { ...(parameters.properties as Record<string, unknown>) };
			delete properties.auth;
			parameters.properties = properties;
		}
		if (Array.isArray(parameters.required)) {
			parameters.required = (parameters.required as string[]).filter((k) => k !== 'auth');
		}
		return {
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description ?? '',
				parameters,
			},
		};
	});
}

/** Shape of an MCP `callTool` result (subset we read). */
interface McpToolResult {
	content?: { type: string; text?: string }[];
	structuredContent?: unknown;
	isError?: boolean;
}

/** Flattens an MCP tool result into a string for the model. */
function stringifyToolResult(result: McpToolResult): string {
	if (result.structuredContent !== undefined) {
		return JSON.stringify(result.structuredContent);
	}
	const text = (result.content ?? [])
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text)
		.join('\n');
	return text || '(no content)';
}

/**
 * Creates and connects an agent: spawns the MCP server, connects the client,
 * and wires up the OpenAI model client. Reuse the returned object across many
 * requests; call `close()` on shutdown.
 */
export async function createAgent(): Promise<Agent> {
	// Validate credentials exist up front for a clear early error. The actual
	// client is created per request (see runAgent) so a refreshed token in .env
	// is picked up without restarting a long-running server.
	resolveOpenAiCredentials();

	// Resolve the compiled server entry next to this file (dist/index.js) so the
	// agent works regardless of the current working directory.
	const serverEntry = fileURLToPath(new URL('./index.js', import.meta.url));

	const transport = new StdioClientTransport({
		command: 'node',
		args: [serverEntry],
		// Forward env so the server gets UACAPI_ENDPOINT / token / context headers.
		env: { ...process.env } as Record<string, string>,
	});
	const mcp = new Client({ name: 'uacapi-agent', version: '0.1.0' }, { capabilities: {} });
	await mcp.connect(transport);

	const { tools: mcpTools } = (await mcp.listTools()) as { tools: McpToolDescriptor[] };
	const tools = toOpenAITools(mcpTools);

	async function runAgent(
		prompt: string,
		history: ChatTurn[] = [],
		initialFilters: SearchFilterState = {},
		auth?: RequestAuthContext,
	): Promise<AgentRunResult> {
		// Build a fresh client each run using the current .env credentials, so an
		// expired Bedrock token can be refreshed without restarting the process.
		const { apiKey, baseURL } = resolveOpenAiCredentials();
		const openai = new OpenAI({ apiKey, baseURL });

		// Accumulated structured filters, merged with each search_products call.
		let filterState: SearchFilterState = { ...initialFilters };
		// Structured products from the most recent non-empty search (for UI cards).
		let collectedProducts: Product[] = [];
		// Quick-reply chips from the most recent search (for guided refinement).
		let collectedSuggestions: SearchSuggestions = { refinements: [], sorts: [] };
		// Structured orders from the most recent get_orders call (for UI rendering).
		let collectedOrders: Order[] = [];
		// Structured order detail (with tracking) from the most recent
		// get_order_detail_by_order_number call (for UI rendering).
		let collectedOrderDetail: OrderDetail | null = null;

		// Keep only the most recent turns to bound tokens, and trim long assistant
		// answers (they can contain big markdown product tables).
		const priorTurns: ChatCompletionMessageParam[] = history
			.slice(-MAX_HISTORY_TURNS)
			.filter((t) => t.content && t.content.trim().length > 0)
			.map((t) => ({
				role: t.role,
				content: t.role === 'assistant' ? t.content.slice(0, MAX_ASSISTANT_CHARS) : t.content,
			}));

		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: SYSTEM_PROMPT },
			...priorTurns,
			{ role: 'user', content: prompt },
		];
		const toolCalls: { name: string; arguments: unknown }[] = [];
		let toolCallsMade = 0;

		for (let turn = 0; turn < MAX_TURNS; turn += 1) {
			// Once the tool-call budget is spent, force a text-only answer.
			const toolChoice = toolCallsMade >= MAX_TOOL_CALLS ? 'none' : 'auto';

			let completion;
			try {
				completion = await openai.chat.completions.create({
					model: MODEL,
					messages,
					tools,
					tool_choice: toolChoice,
				});
			} catch (err) {
				// Surface the underlying provider detail for troubleshooting.
				const e = err as {
					status?: number;
					code?: string;
					message?: string;
					error?: { message?: string; type?: string; code?: string };
					requestID?: string;
				};
				const detail = e.error?.message ?? e.message ?? String(err);
				// eslint-disable-next-line no-console
				console.error(
					`[agent] model call failed: status=${e.status} code=${e.code ?? e.error?.code} ` +
						`type=${e.error?.type} requestID=${e.requestID} detail=${JSON.stringify(detail)}`,
				);
				if (e.status === 401) {
					throw new Error(
						`OpenAI/Bedrock auth failed (401): ${detail}. ` +
							'This usually means OPENAI_API_KEY is expired/invalid, the token was ' +
							'truncated (multi-line paste), or OPENAI_BASE_URL/region is wrong. ' +
							'Check the [agent] creds log above, refresh the token in .env, then retry.',
					);
				}
				throw err;
			}

			const message = completion.choices[0].message;
			messages.push(message);

			const requestedCalls = message.tool_calls ?? [];
			if (requestedCalls.length === 0) {
				return {
					answer: message.content ?? '',
					products: collectedProducts,
					suggestions: collectedSuggestions,
					orders: collectedOrders,
					orderDetail: collectedOrderDetail,
					toolCalls,
					filters: filterState,
				};
			}

			for (const call of requestedCalls) {
				if (call.type !== 'function') continue;
				toolCallsMade += 1;
				const name = call.function.name;
				let args: Record<string, unknown> = {};
				try {
					args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
				} catch {
					args = {};
				}

				// Log exactly what the model decided to call before any merging, so
				// you can see how the LLM turned the prompt into tool arguments.
				// eslint-disable-next-line no-console
				console.error(`[agent] model requested: ${name}(${JSON.stringify(args)})`);

				// For search_products, deterministically merge the model's delta onto
				// the accumulated filter state so refinements never lose prior
				// constraints. `reset` starts a fresh filter set for a new product.
				let effectiveArgs: Record<string, unknown> = args;
				if (name === 'search_products') {
					const base = args.reset === true ? {} : filterState;
					filterState = mergeFilters(base, args);
					effectiveArgs = { ...filterState };
				}

				toolCalls.push({ name, arguments: effectiveArgs });
				// Effective tool input after deterministic merge (what the MCP tool
				// receives; it is then transformed into the UACAPI GraphQL variables).
				// eslint-disable-next-line no-console
				console.error(`[agent] effective tool args (after merge): ${name}(${JSON.stringify(effectiveArgs)})`);

				let resultText: string;
				try {
					// Inject the shopper auth/locale ONLY at the call boundary — never
					// into `toolCalls`/`messages`/logs above — so the token stays out of
					// telemetry and is never exposed to the model.
					const result = (await mcp.callTool({
						name,
						arguments: auth ? { ...effectiveArgs, auth } : effectiveArgs,
					})) as McpToolResult;
					resultText = stringifyToolResult(result);
					// Capture structured products so the UI can render consistent cards.
					if (name === 'search_products') {
						const sc = result.structuredContent as
							| { products?: Product[]; suggestions?: SearchSuggestions }
							| undefined;
						if (sc?.products && sc.products.length > 0) {
							collectedProducts = sc.products;
						}
						if (sc?.suggestions) {
							collectedSuggestions = sc.suggestions;
						}
					}
					if (name === 'get_orders') {
						const sc = result.structuredContent as { orders?: Order[] } | undefined;
						if (sc?.orders && sc.orders.length > 0) {
							collectedOrders = sc.orders;
						}
					}
					if (name === 'get_order_detail_by_order_number') {
						const sc = result.structuredContent as { order?: OrderDetail | null } | undefined;
						if (sc?.order) {
							collectedOrderDetail = sc.order;
						}
					}
				} catch (err) {
					resultText = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
				}

				messages.push({ role: 'tool', tool_call_id: call.id, content: resultText });
			}
		}

		return {
			answer: `Stopped after ${MAX_TURNS} turns without a final answer.`,
			products: collectedProducts,
			suggestions: collectedSuggestions,
			orders: collectedOrders,
			orderDetail: collectedOrderDetail,
			toolCalls,
			filters: filterState,
		};
	}

	async function callTool(
		name: string,
		args: Record<string, unknown>,
		auth?: RequestAuthContext,
	): Promise<unknown> {
		const result = (await mcp.callTool({
			name,
			arguments: auth ? { ...args, auth } : args,
		})) as McpToolResult;
		return result.structuredContent ?? result;
	}

	async function close(): Promise<void> {
		await mcp.close();
	}

	return { runAgent, callTool, close };
}

/** CLI entry: `node dist/agent.js "your prompt"`. */
async function cli(): Promise<void> {
	const prompt = process.argv.slice(2).join(' ').trim() || 'Find me some mens running shoes.';
	const agent = await createAgent();
	try {
		const { answer } = await agent.runAgent(prompt);
		// eslint-disable-next-line no-console
		console.log('\n=== Assistant ===\n');
		// eslint-disable-next-line no-console
		console.log(answer || '(empty response)');
	} finally {
		await agent.close();
	}
}

// Run the CLI only when this module is executed directly.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	cli().catch((err) => {
		// eslint-disable-next-line no-console
		console.error('Agent failed:', err instanceof Error ? (err.stack ?? err.message) : String(err));
		process.exit(1);
	});
}
