/**
 * Integration (machine) token manager for back-office UACAPI queries
 * (`orders`, `orderByOrderNumber`, ...). These are shield-gated and require an
 * Auth0 client-credentials (M2M) token minted for the UACAPI audience.
 *
 * Instead of pasting an expiring `UACAPI_INTEGRATION_TOKEN` into `.env`, configure
 * the Auth0 client credentials once (UACAPI_AUTH0_*) and this module mints the
 * token on demand, caches it until shortly before its `exp`, and transparently
 * refreshes it - the same client-credentials flow Seabiscuit uses.
 *
 * Resolution order per request:
 *   1. A still-valid cached minted token.
 *   2. A still-valid static `UACAPI_INTEGRATION_TOKEN` (manual override).
 *   3. Mint a fresh token via Auth0 (when UACAPI_AUTH0_* is configured).
 *   4. Fall back to the (possibly expired) static token, else undefined.
 */

import { UacapiClient, UacapiRequestError } from './client.js';

/** Refresh this many ms before the token's real expiry to avoid edge races. */
const EXPIRY_SKEW_MS = 60_000;
/** Default audience for the UACAPI commerce API (overridable via env). */
const DEFAULT_AUDIENCE = 'https://commerce.api.ua.com';

interface CachedToken {
	token: string;
	/** Absolute epoch (ms) at which the token should be considered expired. */
	expiresAt: number;
}

/** In-memory cache of the last minted token (process-local). */
let cache: CachedToken | null = null;
/** De-dupes concurrent mints so a burst of requests triggers a single call. */
let inflight: Promise<string> | null = null;

/** Strips an optional `Bearer ` prefix and all whitespace; '' -> undefined. */
function sanitize(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const cleaned = raw.trim().replace(/^bearer\s+/i, '').replace(/\s+/g, '');
	return cleaned || undefined;
}

/** The manually-pasted static integration token, if any. */
function staticToken(): string | undefined {
	return sanitize(process.env.UACAPI_INTEGRATION_TOKEN);
}

/** Returns a JWT's `exp` in ms, or null when it cannot be parsed. */
function jwtExpiryMs(token: string): number | null {
	const parts = token.split('.');
	if (parts.length < 2) return null;
	try {
		const payload = JSON.parse(
			Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
		) as { exp?: number };
		return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}

/** True when the token is absent or within the skew window of expiring. */
function isExpired(token: string): boolean {
	const exp = jwtExpiryMs(token);
	if (exp === null) return false; // unknown exp -> assume usable
	return exp - EXPIRY_SKEW_MS <= Date.now();
}

/** Resolved Auth0 client-credentials config, or null when not configured. */
interface Auth0Config {
	tokenUrl: string;
	clientId: string;
	clientSecret: string;
	audience: string;
}

function auth0Config(): Auth0Config | null {
	const clientId = process.env.UACAPI_AUTH0_CLIENT_ID?.trim();
	const clientSecret = process.env.UACAPI_AUTH0_CLIENT_SECRET?.trim();
	const domain = process.env.UACAPI_AUTH0_DOMAIN?.trim();
	const audience = process.env.UACAPI_AUTH0_AUDIENCE?.trim() || DEFAULT_AUDIENCE;
	if (!clientId || !clientSecret || !domain) return null;
	// Accept either a bare domain ("tenant.auth0.com") or a full token URL.
	const tokenUrl = /^https?:\/\//i.test(domain)
		? domain
		: `https://${domain.replace(/\/+$/, '')}/oauth/token`;
	return { tokenUrl, clientId, clientSecret, audience };
}

/** True when Auth0 auto-minting is configured. */
export function canMintIntegrationToken(): boolean {
	return auth0Config() !== null;
}

/** Performs the Auth0 client-credentials grant and caches the result. */
async function mint(): Promise<string> {
	const cfg = auth0Config();
	if (!cfg) {
		throw new Error(
			'Cannot mint an integration token: set UACAPI_AUTH0_DOMAIN, ' +
				'UACAPI_AUTH0_CLIENT_ID and UACAPI_AUTH0_CLIENT_SECRET (see .env.example).',
		);
	}

	const res = await fetch(cfg.tokenUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({
			grant_type: 'client_credentials',
			client_id: cfg.clientId,
			client_secret: cfg.clientSecret,
			audience: cfg.audience,
		}),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		// Never log the client secret; the body is Auth0's error (safe to show).
		throw new Error(
			`Auth0 token mint failed: HTTP ${res.status} ${res.statusText}. ${body}`.trim(),
		);
	}

	const data = (await res.json()) as { access_token?: string; expires_in?: number };
	const token = sanitize(data.access_token);
	if (!token) throw new Error('Auth0 token mint returned no access_token.');

	// Prefer the JWT `exp`; fall back to `expires_in`; default to 1h.
	const jwtExp = jwtExpiryMs(token);
	const expiresAt =
		jwtExp ?? Date.now() + (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000;
	cache = { token, expiresAt };
	// eslint-disable-next-line no-console
	console.error(
		`[integration-token] minted via Auth0 (expires ${new Date(expiresAt).toISOString()}).`,
	);
	return token;
}

/**
 * Returns a usable integration token, minting/refreshing as needed.
 *
 * @param forceRefresh - skip caches and mint a new token (used after a 401).
 * @returns the token, or undefined when neither Auth0 nor a static token exists.
 */
export async function getIntegrationToken(forceRefresh = false): Promise<string | undefined> {
	if (!forceRefresh) {
		if (cache && cache.expiresAt - EXPIRY_SKEW_MS > Date.now()) return cache.token;
		const stat = staticToken();
		if (stat && !isExpired(stat)) return stat;
	}

	// Need a fresh token: mint if we can, else fall back to the static token.
	if (!canMintIntegrationToken()) {
		const stat = staticToken();
		if (stat && isExpired(stat)) {
			// eslint-disable-next-line no-console
			console.error(
				'[integration-token] static UACAPI_INTEGRATION_TOKEN is EXPIRED and ' +
					'auto-mint is not configured. Set UACAPI_AUTH0_CLIENT_SECRET (plus ' +
					'UACAPI_AUTH0_DOMAIN / UACAPI_AUTH0_CLIENT_ID) in .env and restart, or ' +
					'paste a fresh UACAPI_INTEGRATION_TOKEN.',
			);
		}
		return stat;
	}
	if (!inflight) {
		inflight = mint().finally(() => {
			inflight = null;
		});
	}
	try {
		return await inflight;
	} catch (err) {
		// If minting fails, fall back to the static token (even if stale) so the
		// caller can still try; surface the mint error only when nothing exists.
		const stat = staticToken();
		if (stat) return stat;
		throw err;
	}
}

/** Heuristic: does this UACAPI error indicate an auth/expired-token failure? */
function isAuthError(err: unknown): boolean {
	if (!(err instanceof UacapiRequestError)) return false;
	if (err.status === 401 || err.status === 403) return true;
	return (err.graphqlErrors ?? []).some((e) =>
		/unauthor|jwt expired|must have an integration token|token.*expir/i.test(e.message),
	);
}

/**
 * Executes a GraphQL request authenticated with the integration token, and
 * retries ONCE with a freshly-minted token if the first attempt fails with an
 * auth/expired error. Falls back to `fallbackToken` when no integration token is
 * available.
 */
export async function requestWithIntegrationToken<TData>(
	client: UacapiClient,
	query: string,
	variables: object,
	opts: { contextHeaders?: Record<string, string>; fallbackToken?: string } = {},
): Promise<TData> {
	const token = await getIntegrationToken();
	const usedIntegration = Boolean(token);
	const bearerToken = token ?? opts.fallbackToken;

	try {
		return await client.request<TData>(query, variables, {
			bearerToken,
			contextHeaders: opts.contextHeaders,
		});
	} catch (err) {
		// Only a minted/mintable integration token can be refreshed-and-retried.
		if (usedIntegration && canMintIntegrationToken() && isAuthError(err)) {
			// eslint-disable-next-line no-console
			console.error('[integration-token] auth error; refreshing token and retrying once.');
			const fresh = await getIntegrationToken(true);
			return await client.request<TData>(query, variables, {
				bearerToken: fresh ?? opts.fallbackToken,
				contextHeaders: opts.contextHeaders,
			});
		}
		throw err;
	}
}
