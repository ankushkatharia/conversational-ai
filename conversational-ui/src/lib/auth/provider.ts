/**
 * Authentication abstraction.
 *
 * `LocalAuthProvider` (email/password against our own BFF) is the current
 * implementation. To add SSO later, implement this same interface as
 * `OktaAuthProvider` and swap it in `getAuthProvider()` without touching the UI.
 */

import type { AuthSession, SignUpInput, User } from "@/lib/types";
import { publicConfig } from "@/lib/config";

export interface AuthProvider {
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
}

/** Thrown for expected auth failures; carries a safe, user-facing message. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function apiUrl(path: string): string {
  const base = publicConfig.apiBaseUrl.replace(/\/$/, "");
  return `${base}/api${path}`;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

/**
 * Email/password provider. All calls go to the app's own BFF, which owns the
 * HTTP-only session cookie. Tokens are never handled in client JS.
 */
export class LocalAuthProvider implements AuthProvider {
  async signIn(email: string, password: string): Promise<AuthSession> {
    const res = await fetch(apiUrl("/auth/sign-in"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new AuthError(await parseError(res), res.status);
    return (await res.json()) as AuthSession;
  }

  async signUp(input: SignUpInput): Promise<AuthSession> {
    const res = await fetch(apiUrl("/auth/sign-up"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new AuthError(await parseError(res), res.status);
    return (await res.json()) as AuthSession;
  }

  async signOut(): Promise<void> {
    await fetch(apiUrl("/auth/sign-out"), {
      method: "POST",
      credentials: "include",
    });
  }

  async getCurrentUser(): Promise<User | null> {
    const res = await fetch(apiUrl("/auth/me"), {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: User };
    return data.user ?? null;
  }
}

let provider: AuthProvider | null = null;

/** Returns the active auth provider (swap here to enable Okta later). */
export function getAuthProvider(): AuthProvider {
  if (!provider) provider = new LocalAuthProvider();
  return provider;
}
