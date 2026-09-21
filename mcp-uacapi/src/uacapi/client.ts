/**
 * Minimal, read-only GraphQL client for UACAPI.
 *
 * Design notes:
 * - Uses the native `fetch` (Node >= 18) so we avoid extra dependencies.
 * - Queries are ALWAYS sent with a static query document plus a `variables`
 *   object. We never build query strings by interpolating user input, which
 *   keeps the surface free of GraphQL injection and preserves server-side
 *   query plan caching.
 * - This client only sends the operations we define; it is not a generic
 *   passthrough. Phase 1 is strictly read-only (search).
 */

import { appendFileSync } from 'node:fs';

import type { UacapiConfig } from '../config.js';

/**
 * Writes an opt-in debug line for the outgoing request.
 *
 * Enabled by `DEBUG_UACAPI=1`. Output goes to stderr, and additionally to the
 * file at `DEBUG_UACAPI_FILE` when set (useful because MCP hosts such as the
 * Inspector capture the child process stderr and may not surface it in the UI;
 * a file can be tailed with `tail -f`). The bearer token is never logged.
 */
function debugLog(
	endpoint: string,
	headers: Record<string, string>,
	variables: object,
	body: string,
): void {
	if (process.env.DEBUG_UACAPI !== '1') return;

	// Redact the Authorization header so the bearer token is never printed.
	const safeHeaders = { ...headers };
	if (safeHeaders.authorization) safeHeaders.authorization = 'Bearer <redacted>';

	const lines = [
		`[uacapi] POST ${endpoint}`,
		`[uacapi] headers: ${JSON.stringify(safeHeaders)}`,
		`[uacapi] variables: ${JSON.stringify(variables)}`,
		`[uacapi] body: ${body}`,
	];
	for (const line of lines) console.error(line);

	const file = process.env.DEBUG_UACAPI_FILE?.trim();
	if (file) {
		try {
			appendFileSync(file, `${new Date().toISOString()} ${lines.join('\n')}\n`);
		} catch (err) {
			console.error(`[uacapi] could not write DEBUG_UACAPI_FILE: ${String(err)}`);
		}
	}
}

/** A single GraphQL error entry as returned by a spec-compliant server. */
interface GraphQLError {
	message: string;
	path?: (string | number)[];
	extensions?: Record<string, unknown>;
}

/** Envelope returned by a GraphQL endpoint. */
interface GraphQLResponse<TData> {
	data?: TData;
	errors?: GraphQLError[];
}

/**
 * Error thrown when UACAPI responds with a non-2xx status or a GraphQL
 * `errors` array. Carries the underlying messages for logging/telemetry.
 */
export class UacapiRequestError extends Error {
	public readonly graphqlErrors?: GraphQLError[];

	constructor(message: string, graphqlErrors?: GraphQLError[]) {
		super(message);
		this.name = 'UacapiRequestError';
		this.graphqlErrors = graphqlErrors;
	}
}

/**
 * Thin wrapper around the UACAPI GraphQL endpoint.
 *
 * Instantiate once at startup and reuse for every tool call.
 */
export class UacapiClient {
	private readonly config: UacapiConfig;

	constructor(config: UacapiConfig) {
		this.config = config;
	}

	/**
	 * Executes a GraphQL query using variables.
	 *
	 * @typeParam TData - the expected shape of `data` in the response.
	 * @param query - a static GraphQL document string (no interpolated input).
	 * @param variables - the operation variables; the only place user input flows.
	 * @returns the `data` payload from the response.
	 * @throws {UacapiRequestError} on network failure, non-2xx status, or GraphQL errors.
	 */
	public async request<TData>(query: string, variables: object): Promise<TData> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

		const headers: Record<string, string> = {
			'content-type': 'application/json',
			accept: 'application/json',
			// Context headers (site/locale/client) drive UACAPI search results.
			...this.config.contextHeaders,
		};
		if (this.config.bearerToken) {
			headers.authorization = `Bearer ${this.config.bearerToken}`;
		}

		const body = JSON.stringify({ query, variables });

		// Opt-in live debug of the exact request (DEBUG_UACAPI=1). Never prints
		// the Authorization header/token. Also writes to DEBUG_UACAPI_FILE if set.
		debugLog(this.config.endpoint, headers, variables, body);

		let response: Response;
		try {
			response = await fetch(this.config.endpoint, {
				method: 'POST',
				headers,
				// Variables carry the user input; the query document stays static.
				body,
				signal: controller.signal,
			});
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			throw new UacapiRequestError(`UACAPI request failed: ${reason}`);
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			const bodyText = await response.text().catch(() => '');
			throw new UacapiRequestError(
				`UACAPI returned HTTP ${response.status} ${response.statusText}. ${bodyText}`.trim(),
			);
		}

		const payload = (await response.json()) as GraphQLResponse<TData>;

		if (payload.errors?.length) {
			const summary = payload.errors.map((e) => e.message).join('; ');
			throw new UacapiRequestError(`UACAPI GraphQL error: ${summary}`, payload.errors);
		}

		if (!payload.data) {
			throw new UacapiRequestError('UACAPI returned an empty data payload.');
		}

		return payload.data;
	}
}
