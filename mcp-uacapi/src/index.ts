#!/usr/bin/env node
/**
 * UACAPI MCP server entrypoint (Phase 1, read-only).
 *
 * Registers a single read-only tool, `search_products`, and serves it over the
 * stdio transport so any MCP host can launch this process and communicate with
 * it over stdin/stdout.
 *
 * IMPORTANT: stdout is reserved for the MCP JSON-RPC protocol. All human-facing
 * diagnostics must go to stderr (console.error), never stdout.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig } from './config.js';
import { UacapiClient, UacapiRequestError } from './uacapi/client.js';
import {
	runSearchProducts,
	searchProductsInputSchema,
	SearchProductsInput,
} from './tools/searchProducts.js';
import { runGetOrders, getOrdersInputSchema, GetOrdersInput } from './tools/getOrders.js';
import {
	runGetOrderDetail,
	getOrderDetailInputSchema,
	GetOrderDetailInput,
} from './tools/getOrderDetail.js';
import {
	runCreateSupportTicket,
	createSupportTicketInputSchema,
	CreateSupportTicketInput,
} from './tools/supportTicket.js';
import {
	runRequestUserInput,
	requestUserInputInputSchema,
	RequestUserInputInput,
} from './tools/userInput.js';

async function main(): Promise<void> {
	const config = loadConfig();
	const client = new UacapiClient(config);

	const server = new McpServer({
		name: 'mcp-uacapi',
		version: '0.1.0',
	});

	server.registerTool(
		'search_products',
		{
			title: 'Search UACAPI products',
			description:
				'Read-only product search against UACAPI. Provide a free-text "query", a ' +
				'"categoryId", or both (at least one is required). Optional structured ' +
				'filters: "minPrice"/"maxPrice" (sale price range), "color" (color group ' +
				'e.g. Black), "gender" (Mens/Womens/Boys/Girls/Unisex), plus "sort" and ' +
				'"limit". Returns a stable, mapped list of products with pricing, color ' +
				'variations, and image URLs.',
			inputSchema: searchProductsInputSchema,
			// Declaring read-only intent lets MCP hosts skip write-confirmation prompts.
			annotations: {
				readOnlyHint: true,
				openWorldHint: true,
			},
		},
		async (input: SearchProductsInput) => {
			try {
				const result = await runSearchProducts(client, input);
				return {
					// `structuredContent` carries the machine-readable stable payload;
					// the text block provides a human/LLM-friendly rendering of the same data.
					// Cast to the SDK's open record shape; our result is JSON-serializable.
					structuredContent: result as unknown as Record<string, unknown>,
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (err) {
				const message =
					err instanceof UacapiRequestError || err instanceof Error
						? err.message
						: String(err);
				return {
					isError: true,
					content: [{ type: 'text' as const, text: message }],
				};
			}
		},
	);

	server.registerTool(
		'get_orders',
		{
			title: 'Get UACAPI orders',
			description:
				'Read-only order history lookup against UACAPI. Returns the shopper\'s most ' +
				'recent orders (default 3) with order number, date, status, totals, and line ' +
				'items. Use this for requests like "my last 3 orders" or "order history". ' +
				'The shopper identity and site are injected by the server; only "limit" is ' +
				'model-controlled.',
			inputSchema: getOrdersInputSchema,
			annotations: {
				readOnlyHint: true,
				openWorldHint: true,
			},
		},
		async (input: GetOrdersInput) => {
			try {
				const result = await runGetOrders(client, input);
				return {
					structuredContent: result as unknown as Record<string, unknown>,
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (err) {
				const message =
					err instanceof UacapiRequestError || err instanceof Error
						? err.message
						: String(err);
				return {
					isError: true,
					content: [{ type: 'text' as const, text: message }],
				};
			}
		},
	);

	server.registerTool(
		'get_order_detail_by_order_number',
		{
			title: 'Get UACAPI order detail by order number',
			description:
				'Read-only order tracking lookup against UACAPI. Given an order number (or ' +
				'RMA number), returns that single order with status, totals, line items, ' +
				'addresses, and per-shipment TRACKING NUMBERS and TRACKING LINKS. Use this ' +
				'for requests like "track my order", "where is order <number>", or "tracking ' +
				'for <order number>". The site/locale and auth are injected by the server; ' +
				'only "orderNumber" is model-controlled.',
			inputSchema: getOrderDetailInputSchema,
			annotations: {
				readOnlyHint: true,
				openWorldHint: true,
			},
		},
		async (input: GetOrderDetailInput) => {
			try {
				const result = await runGetOrderDetail(client, input);
				return {
					structuredContent: result as unknown as Record<string, unknown>,
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (err) {
				const message =
					err instanceof UacapiRequestError || err instanceof Error
						? err.message
						: String(err);
				return {
					isError: true,
					content: [{ type: 'text' as const, text: message }],
				};
			}
		},
	);

	server.registerTool(
		'create_support_ticket',
		{
			title: 'Create a support ticket / contact request',
			description:
				'Create a help request for the Help / Queries flow. Use after the shopper has ' +
				'chosen a category (order | payment | product | return_refund | other), ' +
				'described the problem, and chosen how to be helped ("ticket" for an email ' +
				'follow-up, or "call" for a phone call back). Collect "contactEmail" for a ' +
				'ticket (falls back to the login email) or "contactPhone" for a call. ' +
				'Generates a ticket reference and emails the support inbox. Only call this ' +
				'with the user\'s explicit confirmation and their own details; the server ' +
				'injects identity/site/login-email.',
			inputSchema: createSupportTicketInputSchema,
			annotations: {
				readOnlyHint: false,
				openWorldHint: true,
			},
		},
		async (input: CreateSupportTicketInput) => {
			try {
				const result = await runCreateSupportTicket(input);
				return {
					structuredContent: result as unknown as Record<string, unknown>,
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (err) {
				const message =
					err instanceof UacapiRequestError || err instanceof Error
						? err.message
						: String(err);
				return {
					isError: true,
					content: [{ type: 'text' as const, text: message }],
				};
			}
		},
	);

	server.registerTool(
		'request_user_input',
		{
			title: 'Request inline input from the shopper',
			description:
				'Render an inline interactive control inside the chat to drive a ' +
				'conversational flow (primarily Help / Queries). Use "chips" to offer ' +
				'tappable choices (e.g. a help category, or Ticket vs Call), "text_input" ' +
				'to collect a single value inline (e.g. the shopper\'s email or phone), or ' +
				'"confirm" to show a single button (e.g. "Create ticket"). Whatever the ' +
				'shopper taps or types is sent back to you as their next message, so you ' +
				'stay in control of every step. After calling this, write ONE short ' +
				'sentence introducing the control and stop. Do not ask for the same ' +
				'information in plain text as well.',
			inputSchema: requestUserInputInputSchema,
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			},
		},
		async (input: RequestUserInputInput) => {
			try {
				const result = await runRequestUserInput(input);
				return {
					structuredContent: result as unknown as Record<string, unknown>,
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (err) {
				const message =
					err instanceof UacapiRequestError || err instanceof Error
						? err.message
						: String(err);
				return {
					isError: true,
					content: [{ type: 'text' as const, text: message }],
				};
			}
		},
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(
		'mcp-uacapi server started (stdio). Tools: search_products, get_orders, ' +
			'get_order_detail_by_order_number, create_support_ticket, request_user_input ' +
			'[read-only + 1 action].',
	);
}

main().catch((err) => {
	console.error('Fatal: failed to start mcp-uacapi server.');
	console.error(err instanceof Error ? err.stack ?? err.message : String(err));
	process.exit(1);
});
