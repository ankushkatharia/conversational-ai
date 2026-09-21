import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/** Routes that require an authenticated session. */
const PROTECTED = ["/chat"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const uid = await verifySessionToken(token);
  if (uid) return NextResponse.next();

  const signIn = new URL("/auth/sign-in", req.url);
  signIn.searchParams.set("redirect", pathname + req.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/chat/:path*", "/chat"],
};
