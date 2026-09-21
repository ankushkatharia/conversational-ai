/**
 * Signed, HTTP-only session cookie helpers.
 *
 * Uses the Web Crypto API (available in both the Node route-handler runtime and
 * the Edge middleware runtime) so the same verification works everywhere.
 *
 * The cookie value is `base64url(payload).base64url(hmac)`. The payload holds
 * only the user id and expiry. The signing secret never leaves the server, and
 * the cookie is HTTP-only so it is not readable by client-side JavaScript.
 */

import { serverConfig } from "@/lib/config";

export const SESSION_COOKIE = "ua_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type SessionPayload = { uid: string; exp: number };

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): ArrayBuffer {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = serverConfig().sessionSecret;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Creates a signed session token for a user id. */
export async function createSessionToken(uid: string): Promise<{
  token: string;
  maxAge: number;
}> {
  const payload: SessionPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadStr = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr)),
  );
  return { token: `${payloadStr}.${toBase64Url(sig)}`, maxAge: SESSION_TTL_SECONDS };
}

/** Verifies a session token and returns the user id, or null when invalid. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token || !token.includes(".")) return null;
  const [payloadStr, sigStr] = token.split(".");
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigStr),
      new TextEncoder().encode(payloadStr),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadStr)),
    ) as SessionPayload;
    if (!payload.uid || payload.exp * 1000 < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

/** Attributes for the Set-Cookie header of the session cookie. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
