"use client";

/**
 * Client-side auth context. Wraps the active `AuthProvider` and exposes the
 * signed-in user plus sign-in/up/out actions to the component tree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SignUpInput, User } from "@/lib/types";
import { getAuthProvider } from "@/lib/auth/provider";

type AuthContextValue = {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (input: SignUpInput) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthContextProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: User | null;
}) {
  const provider = useMemo(() => getAuthProvider(), []);
  const [user, setUser] = useState<User | null>(initialUser);
  const [status, setStatus] = useState<AuthContextValue["status"]>(
    initialUser ? "authenticated" : "loading",
  );

  const refresh = useCallback(async () => {
    const current = await provider.getCurrentUser();
    setUser(current);
    setStatus(current ? "authenticated" : "unauthenticated");
  }, [provider]);

  useEffect(() => {
    if (initialUser) return;
    // Fetches the current user from the BFF; state updates happen in a
    // microtask after the network call, not synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [initialUser, refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await provider.signIn(email, password);
      setUser(session.user);
      setStatus("authenticated");
      return session.user;
    },
    [provider],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const session = await provider.signUp(input);
      setUser(session.user);
      setStatus("authenticated");
      return session.user;
    },
    [provider],
  );

  const signOut = useCallback(async () => {
    await provider.signOut();
    setUser(null);
    setStatus("unauthenticated");
  }, [provider]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signUp, signOut, refresh }),
    [user, status, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthContextProvider");
  return ctx;
}
