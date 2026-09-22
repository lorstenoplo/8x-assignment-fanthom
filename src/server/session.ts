import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "fathom_ws";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // Dev fallback so the app runs before .env.local is filled in. Never used
    // to protect anything real: a workspace created under this secret is only
    // ever readable on this same unconfigured machine.
    return "insecure-dev-secret-set-SESSION_SECRET-in-.env.local";
  }
  return s;
}

function sign(id: string) {
  const mac = createHmac("sha256", secret()).update(id).digest("base64url");
  return `${id}.${mac}`;
}

function verify(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(id).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

/**
 * Reads the workspace cookie and confirms that row still exists. Does not
 * create one — call `ensureWorkspace` from a Server Action / Route Handler
 * (cookie writes are not allowed from plain Server Components).
 */
export async function getWorkspaceId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const id = verify(raw);
  if (!id) return null;
  return id;
}

export async function setWorkspaceCookie(id: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, sign(id), {
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
 */
export async function ensureWorkspace(): Promise<string> {
  const existing = await getWorkspaceId();
  if (existing) {
    const row = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, existing) });
    if (row) return row.id;
  }
  const [created] = await db.insert(schema.workspaces).values({}).returning({ id: schema.workspaces.id });
  await setWorkspaceCookie(created.id);
  return created.id;
}

/**
 * For read paths: use the visitor's own workspace if they have one, otherwise
 * the public demo workspace, so the live link is never empty for a stranger.
 * Never creates a row — read-only Server Components can call this safely.
 */
export async function getViewingWorkspaceId(): Promise<string> {
  const own = await getWorkspaceId();
  if (own) return own;
  const demo = process.env.DEMO_WORKSPACE_ID;
  if (demo) return demo;
  const row = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.isDemo, true) });
  if (row) return row.id;
  throw new Error("No workspace cookie and no demo workspace configured/seeded.");
}
