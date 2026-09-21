/**
 * In-memory user store for local/mock authentication.
 *
 * This persists only for the lifetime of the server process, which is enough
 * for local UI development and tests. Passwords are stored only as salted
 * SHA-256 hashes; plaintext passwords are never retained or logged.
 *
 * Replace this module with a real data source (or the Okta provider) later.
 */

import type { User } from "@/lib/types";

type StoredUser = User & { passwordHash: string };

const users = new Map<string, StoredUser>(); // key: lowercased email

async function hashPassword(password: string): Promise<string> {
  const salt = "ua-local-auth"; // static salt is acceptable for a mock store
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeUserId(email: string): string {
  return `usr_${email.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
}

async function seed(): Promise<void> {
  if (users.size > 0) return;
  const email = "demo@underarmour.com";
  users.set(email, {
    id: makeUserId(email),
    name: "Demo Athlete",
    email,
    passwordHash: await hashPassword("password123"),
  });
}

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  await seed();
  return users.get(email.toLowerCase());
}

export async function findUserById(id: string): Promise<User | undefined> {
  await seed();
  for (const u of users.values()) {
    if (u.id === id) return { id: u.id, name: u.name, email: u.email };
  }
  return undefined;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export async function createUser(
  name: string,
  email: string,
  password: string,
): Promise<{ user?: User; error?: string }> {
  await seed();
  const key = email.toLowerCase();
  if (users.has(key)) {
    return { error: "An account with this email already exists." };
  }
  const user: StoredUser = {
    id: makeUserId(email),
    name,
    email,
    passwordHash: await hashPassword(password),
  };
  users.set(key, user);
  return { user: { id: user.id, name: user.name, email: user.email } };
}
