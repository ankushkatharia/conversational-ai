/**
 * HTTP API for testing (e.g. from Postman).
 *
 * Wraps the MCP agent behind simple JSON endpoints so you can exercise the
 * whole flow over HTTP without an MCP host. Uses only Node's built-in `http`
 * (no extra web framework) and shares a single connected agent across requests.
 *
 * Endpoints:
 *   GET  /health                      -> { status: "ok" }
 *   POST /agent                       -> { answer, toolCalls }   (LLM + tools)
 *     Body (any shape):
 *       { "prompt": "..." }                                 (single message, no memory)
 *       { "sessionId": "s1", "prompt": "..." }              (server remembers this
 *         session in memory; send the same sessionId each turn for follow-ups)
 *       { "messages": [{ role, content }, ...] }            (client-managed history;
 *         last user turn is the current message, earlier turns are context)
 *   POST /search  { query?, categoryId?, limit?, sort? }
 *                                     -> stable search result     (tool only, no LLM)
 *
 * Note: sessions live in process memory only (no DB); they are lost on restart
 * and not shared across instances. Fine for local/dev testing.
 *
 * Start: `node dist/http.js`  (or `npm run serve`). Port from API_PORT (8787).
 */

import http from 'node:http';

import { Agent, ChatTurn, createAgent, RequestAuthContext, SearchFilterState } from './agent.js';

const PORT = Number.parseInt(process.env.API_PORT ?? '8787', 10);

/** Per-session state: conversation turns + accumulated structured filters. */
interface SessionState {
	history: ChatTurn[];
	filters: SearchFilterState;
}

/**
 * In-memory conversation store keyed by `sessionId`. No DB: this lives only in
 * the running process, is lost on restart, and is not shared across instances.
 */
const sessions = new Map<string, SessionState>();
/** Max turns retained per session (bounds memory + tokens). */
const SESSION_MAX_TURNS = 20;
/** Max distinct sessions kept; oldest is evicted past this (simple guard). */
const MAX_SESSIONS = 500;

/**
 * When the client sends a plain `{ prompt }` (no `sessionId`, no `messages`),
 * fall back to this shared session so consecutive prompts still chain and the
 * assistant "remembers" the conversation without any client change.
 *
 * Set AGENT_DEFAULT_SESSION=off to disable (each plain prompt is then isolated).
 * Note: this is a single shared thread, fine for a local/single-user demo but
 * not suitable for multiple independent users.
 */
function defaultSessionId(): string | null {
	const cfg = process.env.AGENT_DEFAULT_SESSION;
	if (cfg === 'off') return null;
	return cfg && cfg.trim() ? cfg.trim() : 'default';
}

/** Returns the first value of a (possibly repeated) request header, trimmed. */
function headerValue(req: http.IncomingMessage, name: string): string | undefined {
	const raw = req.headers[name];
	const value = Array.isArray(raw) ? raw[0] : raw;
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Extracts the per-request shopper auth + locale from the incoming headers.
 *
 * - `Authorization: Bearer <token>` -> the shopper's UACAPI token (guest or
 *   logged-in). The scheme prefix is stripped; UACAPI client re-adds it.
 * - `x-ua-locale: <lang>-<site>` (e.g. "en-us") -> split into UACAPI's
 *   `ua-language-code` ("en") and `ua-site-code` ("US"). Explicit
 *   `x-ua-site-code` / `x-ua-language-code` headers, if present, take precedence.
 *
 * Returns `undefined` when nothing relevant is present, so the server falls back
 * to its static startup token/context (useful for Postman/no-auth testing).
 */
function parseAuthContext(req: http.IncomingMessage): RequestAuthContext | undefined {
	const authorization = headerValue(req, 'authorization');
	const bearerToken = authorization?.replace(/^bearer\s+/i, '').trim() || undefined;

	let languageCode = headerValue(req, 'x-ua-language-code');
	let siteCode = headerValue(req, 'x-ua-site-code');

	const locale = headerValue(req, 'x-ua-locale');
	if (locale && (!languageCode || !siteCode)) {
		const [lang, site] = locale.split('-');
		if (!languageCode && lang) languageCode = lang.toLowerCase();
		if (!siteCode && site) siteCode = site.toUpperCase();
	}

	if (!bearerToken && !languageCode && !siteCode) return undefined;
	return { bearerToken, languageCode, siteCode };
}

/** Reads and JSON-parses a request body (empty body -> {}). */
async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	const raw = Buffer.concat(chunks).toString('utf8').trim();
	if (!raw) return {};
	return JSON.parse(raw) as Record<string, unknown>;
}

/** Writes a JSON response with the given status code. */
function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
	const body = JSON.stringify(payload, null, 2);
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(body);
}

async function main(): Promise<void> {
	// Connect the agent (spawns the MCP server) once at startup.
	const agent: Agent = await createAgent();

	const server = http.createServer((req, res) => {
		// Delegate to an async handler and centralize error handling.
		void handle(req, res, agent).catch((err) => {
			const message = err instanceof Error ? err.message : String(err);
			sendJson(res, 500, { error: message });
		});
	});

	// Ensure the MCP child process is cleaned up on shutdown.
	const shutdown = async (): Promise<void> => {
		await agent.close().catch(() => undefined);
		server.close(() => process.exit(0));
	};
	process.on('SIGINT', () => void shutdown());
	process.on('SIGTERM', () => void shutdown());

	server.listen(PORT, () => {
		// eslint-disable-next-line no-console
		console.error(`mcp-uacapi HTTP API listening on http://localhost:${PORT}`);
		// eslint-disable-next-line no-console
		console.error('  GET  /health');
		// eslint-disable-next-line no-console
		console.error(
			'  POST /agent   { "prompt": "..." } | { "sessionId": "s1", "prompt": "..." } | { "messages": [...] }',
		);
		// eslint-disable-next-line no-console
		console.error('  POST /search  { "query": "...", "categoryId": "...", "limit": 10, "sort": "top-sellers" }');
	});
}

/** Routes a single request. */
async function handle(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	agent: Agent,
): Promise<void> {
	const method = req.method ?? 'GET';
	const path = (req.url ?? '/').split('?')[0];

	if (method === 'GET' && path === '/health') {
		sendJson(res, 200, { status: 'ok' });
		return;
	}

	if (method === 'POST' && path === '/agent') {
		const body = await readJsonBody(req);
		// Shopper auth + locale from request headers (guest or logged-in token).
		const authContext = parseAuthContext(req);

		const explicitSessionId =
			typeof body.sessionId === 'string' && body.sessionId.trim()
				? body.sessionId.trim()
				: null;
		const clientManagedHistory = Array.isArray(body.messages);

		let prompt = '';
		let history: ChatTurn[] = [];

		if (Array.isArray(body.messages)) {
			const turns = (body.messages as unknown[])
				.filter(
					(m): m is { role: string; content: string } =>
						!!m &&
						typeof m === 'object' &&
						typeof (m as { role?: unknown }).role === 'string' &&
						typeof (m as { content?: unknown }).content === 'string',
				)
				.filter((m) => m.role === 'user' || m.role === 'assistant')
				.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.trim() }))
				.filter((m) => m.content.length > 0);

			// Find the last user turn: that is the current message; prior turns are context.
			const lastUserIdx = [...turns].reverse().findIndex((m) => m.role === 'user');
			if (lastUserIdx === -1) {
				sendJson(res, 400, { error: 'messages must include at least one user turn.' });
				return;
			}
			const idx = turns.length - 1 - lastUserIdx;
			prompt = turns[idx].content;
			history = turns.slice(0, idx);
		} else if (typeof body.prompt === 'string') {
			prompt = body.prompt.trim();
		}

		if (!prompt) {
			sendJson(res, 400, { error: 'Body must include a non-empty "prompt" or "messages".' });
			return;
		}

		// Resolve which session to use: explicit sessionId wins; otherwise, for a
		// plain prompt (no client-managed messages) fall back to the shared default
		// session so consecutive prompts chain without any client change.
		const sessionId =
			explicitSessionId ?? (clientManagedHistory ? null : defaultSessionId());

		// If a session is in play, load its stored turns + accumulated filters so
		// the model has memory across separate requests (no DB; process memory only).
		const stored = sessionId ? sessions.get(sessionId) : undefined;
		const effectiveHistory = [...(stored?.history ?? []), ...history];
		const initialFilters = stored?.filters ?? {};

		const result = await agent.runAgent(prompt, effectiveHistory, initialFilters, authContext);

		if (sessionId) {
			const updatedHistory: ChatTurn[] = [
				...effectiveHistory,
				{ role: 'user' as const, content: prompt },
				{ role: 'assistant' as const, content: result.answer ?? '' },
			].slice(-SESSION_MAX_TURNS);
			// Refresh recency (re-insert) and evict oldest if over capacity.
			sessions.delete(sessionId);
			sessions.set(sessionId, { history: updatedHistory, filters: result.filters });
			while (sessions.size > MAX_SESSIONS) {
				const oldest = sessions.keys().next().value;
				if (oldest === undefined) break;
				sessions.delete(oldest);
			}
		}

		sendJson(res, 200, result);
		return;
	}

	if (method === 'POST' && path === '/search') {
		const body = await readJsonBody(req);
		// Pass through only the recognized tool arguments.
		const args: Record<string, unknown> = {};
		if (typeof body.query === 'string') args.query = body.query;
		if (typeof body.categoryId === 'string') args.categoryId = body.categoryId;
		if (typeof body.limit === 'number') args.limit = body.limit;
		if (typeof body.sort === 'string') args.sort = body.sort;
		if (typeof body.minPrice === 'number') args.minPrice = body.minPrice;
		if (typeof body.maxPrice === 'number') args.maxPrice = body.maxPrice;
		if (typeof body.color === 'string') args.color = body.color;
		if (typeof body.gender === 'string') args.gender = body.gender;

		if (args.query === undefined && args.categoryId === undefined) {
			sendJson(res, 400, { error: 'Provide at least one of "query" or "categoryId".' });
			return;
		}
		const result = await agent.callTool('search_products', args, parseAuthContext(req));
		sendJson(res, 200, result);
		return;
	}

	sendJson(res, 404, { error: `No route for ${method} ${path}` });
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error('HTTP API failed to start:', err instanceof Error ? (err.stack ?? err.message) : String(err));
	process.exit(1);
});
