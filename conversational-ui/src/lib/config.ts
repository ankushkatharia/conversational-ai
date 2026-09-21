/**
 * Runtime configuration.
 *
 * - `publicConfig` is safe for the browser (only NEXT_PUBLIC_* values).
 * - `serverConfig()` reads server-only values and must never be imported into
 *   client components.
 */

export const publicConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Under Armour Shopping Assistant",
  /** Base URL the browser uses for API calls. Empty => same-origin "/api". */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
} as const;

/** Server-only configuration. Do not import from client components. */
export function serverConfig() {
  const useMock = (process.env.USE_MOCK ?? "true").toLowerCase() !== "false";
  // Normalize the backend base URL: drop a trailing slash and a trailing
  // `/agent` (or `/search`) so callers can paste either the root or a full
  // endpoint URL. The client appends `/agent` and `/search` itself.
  const agentApiBaseUrl = (process.env.AGENT_API_BASE_URL ?? "http://localhost:8787")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(agent|search)$/i, "");
  return {
    useMock,
    agentApiBaseUrl,
    sessionSecret: process.env.AUTH_SESSION_SECRET ?? "dev-only-change-me",
  };
}
