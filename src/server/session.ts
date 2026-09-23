import "server-only";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  WORKSPACE_COOKIE,
  signWorkspaceId,
  verifyWorkspaceToken,
} from "@/server/cookie-sign";

/**
 * Reads the workspace cookie (signed by `proxy.ts` for every new visitor, or
 * by `setWorkspaceCookie` below) and confirms the signature. Does not create
 * a row — call `ensureWorkspace` from a Server Action / Route Handler for
 * that (cookie writes are not allowed from plain Server Components).
 */
export async function getWorkspaceId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(WORKSPACE_COOKIE)?.value;
  if (!raw) return null;
  return verifyWorkspaceToken(raw);
}

export async function setWorkspaceCookie(id: string) {
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, signWorkspaceId(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Gets-or-creates the visitor's own workspace. Used by anything that writes
 * (starting a meeting, changing a preference). Read-only pages that should
 * work for a signed-out visitor use `getViewingWorkspaceId` instead, which
 * falls back to the seeded demo workspace rather than creating a new one.
 *
 * `proxy.ts` signs a cookie with a fresh id for every new visitor before any
 * DB row exists (an edge-cheap operation with no database round trip). This
 * is where that id turns into an actual row — inserted *with* that same id,
 * so the cookie a visitor already has keeps pointing at the workspace this
 * call creates, instead of silently swapping to a new one.
 */
export async function ensureWorkspace(): Promise<string> {
  const existing = await getWorkspaceId();
  if (existing) {
    const row = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, existing),
    });
    if (row) return row.id;
    const [created] = await db
      .insert(schema.workspaces)
      .values({ id: existing })
      .returning({ id: schema.workspaces.id });
    return created.id;
  }
  const [created] = await db
    .insert(schema.workspaces)
    .values({})
    .returning({ id: schema.workspaces.id });
  await setWorkspaceCookie(created.id);
  return created.id;
}

/**
 * For read paths: use the visitor's own workspace if they have one, otherwise
 * the public demo workspace, so the live link is never empty for a stranger.
 * Never creates a row — read-only Server Components can call this safely.
 */
export async function getViewingWorkspaceId(): Promise<string> {
  return (await getViewingWorkspaceIds())[0];
}

/** The demo site always reads from the seeded workspace, never from a browser cookie. */
export async function getViewingWorkspaceIds(): Promise<string[]> {
  const demo =
    process.env.DEMO_WORKSPACE_ID ??
    (
      await db.query.workspaces.findFirst({
        where: eq(schema.workspaces.isDemo, true),
      })
    )?.id;
  if (!demo) throw new Error("No demo workspace configured/seeded.");
  return [demo];
}
