import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { WORKSPACE_COOKIE, signWorkspaceId } from "@/server/cookie-sign";

/**
 * Runs before every non-API page request. If the visitor has no workspace
 * cookie yet, signs one with a fresh id right here — cheaply, no DB round
 * trip — so any page they land on (including the seeded demo, which never
 * needs this) can tell a brand-new visitor from a returning one. The actual
 * workspace row is created lazily, on first write, by `ensureWorkspace`.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(WORKSPACE_COOKIE)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(WORKSPACE_COOKIE, signWorkspaceId(randomUUID()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|s/).*)"],
};
