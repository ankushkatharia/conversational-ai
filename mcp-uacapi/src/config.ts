/**
 * Runtime configuration for the UACAPI MCP server.
 *
 * All configuration is sourced from environment variables so the server can be
 * launched by any MCP host (Claude Desktop, IDE plugins, etc.) without code
 * changes. Nothing here is secret at rest: the bearer token is read from the
 * environment and never logged.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads a local `.env` file into `process.env` when present.
 *
 * MCP hosts (e.g. the MCP Inspector, Claude Desktop) spawn this process
 * directly and usually do NOT pass `--env-file`, so we load it ourselves.
 * Uses Node's built-in `process.loadEnvFile` (Node >= 20.12 / 22) and is a
 * no-op if the file is absent or the API is unavailable. Existing environment
 * variables set by the host still take precedence and are never overwritten by
 * design of `loadEnvFile` for already-defined keys is not guaranteed, so we
 * only load when the key is not already present.
 */
function loadDotEnvIfPresent(): void {
	const loadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void })
		.loadEnvFile;
	if (typeof loadEnvFile !== 'function') return;

	// Candidate locations: current working directory, and the project root
	// relative to the compiled file (dist/config.js -> ../.env).
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [resolve(process.cwd(), '.env'), resolve(here, '..', '.env')];

	for (const path of candidates) {
		if (existsSync(path)) {
			try {
				loadEnvFile(path);
			} catch {
				// Ignore malformed/locked files; explicit env vars still work.
			}
			return;
		}
	}
}

/**
 * Normalizes a raw bearer token value from the environment.
 *
 * Bearer tokens (JWT or opaque) never contain whitespace and must not include
 * the `Bearer ` scheme prefix, because this server adds that prefix itself.
 * Copy-pasting from consoles frequently introduces both problems, which makes
 * UACAPI reject the request with an HTTP 401 "Format is Authorization: Bearer
 * [token]" error. We defensively strip:
 *   - a leading, case-insensitive `Bearer ` prefix, and
 *   - all internal whitespace (spaces, tabs, newlines from line-wrapped pastes).
 *
 * @param raw - the raw `UACAPI_BEARER_TOKEN` value (may be undefined).
 * @returns the cleaned token, or `undefined` when no token is configured.
 */
function sanitizeBearerToken(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const withoutPrefix = raw.trim().replace(/^bearer\s+/i, '');
	const cleaned = withoutPrefix.replace(/\s+/g, '');
	if (!cleaned) return undefined;
	if (cleaned !== raw.trim()) {
		// Diagnostic only; never logs the token value.
		console.error('Note: UACAPI_BEARER_TOKEN was normalized (removed "Bearer " prefix/whitespace).');
	}
	return cleaned;
}

/**
 * Builds the UACAPI context headers from environment variables.
 *
 * UACAPI's `searchProducts` (and other resolvers) select the site, locale, and
 * client type from request headers (see UACAPI `context.ts`):
 *   - `ua-site-code`     country/site, default US
 *   - `ua-language-code` language, default en (locale becomes `<lang>-<site>`)
 *   - `uaclienttype` / `user-agent` client type (WEB/ANDROID/IOS/...), default OTHER
 * Different context yields different results, sorting, and personalization, so
 * matching your Apollo Sandbox headers makes the MCP results match.
 *
 * Convenience vars map to the well-known headers; `UACAPI_HEADERS` is a JSON
 * object for any additional/custom headers and is applied last (wins on clash).
 *
 * @returns a header map (may be empty when nothing is configured).
 */
function buildContextHeaders(): Record<string, string> {
	const headers: Record<string, string> = {};

	const siteCode = process.env.UACAPI_SITE_CODE?.trim();
	if (siteCode) headers['ua-site-code'] = siteCode;

	const languageCode = process.env.UACAPI_LANGUAGE_CODE?.trim();
	if (languageCode) headers['ua-language-code'] = languageCode;

	const clientType = process.env.UACAPI_CLIENT_TYPE?.trim();
	if (clientType) headers.uaclienttype = clientType;

	const userAgent = process.env.UACAPI_USER_AGENT?.trim();
	if (userAgent) headers['user-agent'] = userAgent;

	const rawJson = process.env.UACAPI_HEADERS?.trim();
	if (rawJson) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawJson);
		} catch {
			throw new Error('UACAPI_HEADERS must be a valid JSON object of string values.');
		}
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('UACAPI_HEADERS must be a JSON object, e.g. {"ua-site-code":"US"}.');
		}
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			// Header values must be strings; coerce numbers/booleans defensively.
			headers[key.toLowerCase()] = String(value);
		}
	}

	return headers;
}

/** Shape of the resolved, validated configuration. */
export interface UacapiConfig {
	/** Absolute URL of the UACAPI GraphQL endpoint. */
	endpoint: string;
	/** Optional bearer token attached as `Authorization: Bearer <token>`. */
	bearerToken?: string;
	/** Per-request network timeout in milliseconds. */
	timeoutMs: number;
	/**
	 * Extra context headers sent on every request. UACAPI derives the site,
	 * locale, and client type from these, which materially changes search
	 * results. Populated from UACAPI_SITE_CODE / UACAPI_LANGUAGE_CODE /
	 * UACAPI_CLIENT_TYPE / UACAPI_USER_AGENT / UACAPI_HEADERS.
	 */
	contextHeaders: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Reads and validates configuration from `process.env`.
 *
 * Throws a descriptive error when required values are missing so the failure is
 * visible in the MCP host logs at startup rather than surfacing as a confusing
 * network error on the first tool call.
 *
 * @returns the validated configuration object.
 */
export function loadConfig(): UacapiConfig {
	loadDotEnvIfPresent();

	const endpoint = process.env.UACAPI_ENDPOINT?.trim();
	if (!endpoint) {
		throw new Error(
			'UACAPI_ENDPOINT is required. Set it to the UACAPI GraphQL endpoint URL (see .env.example).',
		);
	}

	// Fail fast on obviously malformed endpoints instead of at request time.
	try {
		// eslint-disable-next-line no-new
		new URL(endpoint);
	} catch {
		throw new Error(`UACAPI_ENDPOINT is not a valid URL: "${endpoint}"`);
	}

	const bearerToken = sanitizeBearerToken(process.env.UACAPI_BEARER_TOKEN);

	const rawTimeout = process.env.UACAPI_TIMEOUT_MS?.trim();
	const timeoutMs = rawTimeout ? Number.parseInt(rawTimeout, 10) : DEFAULT_TIMEOUT_MS;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`UACAPI_TIMEOUT_MS must be a positive integer, received: "${rawTimeout}"`);
	}

	const contextHeaders = buildContextHeaders();

	return { endpoint, bearerToken, timeoutMs, contextHeaders };
}
