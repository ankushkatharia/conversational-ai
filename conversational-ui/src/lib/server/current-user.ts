/**
 * Resolves the signed-in user for a route handler from the session cookie.
 * Server-only.
 */

import { cookies } from "next/headers";

import type { User } from "@/lib/types";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/store";

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const uid = await verifySessionToken(token);
  if (!uid) return null;
  return (await findUserById(uid)) ?? null;
}
