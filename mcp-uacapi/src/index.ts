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

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('mcp-uacapi server started (stdio). Tool: search_products [read-only].');
}

main().catch((err) => {
	console.error('Fatal: failed to start mcp-uacapi server.');
	console.error(err instanceof Error ? err.stack ?? err.message : String(err));
	process.exit(1);
});
