import "server-only";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getWorkspaceId, getViewingWorkspaceId } from "@/server/session";

/**
 * For read-only pages (dashboard, search, ask, alerts): always renders,
 * never redirects. A visitor's own workspace cookie is set by `proxy.ts` on
 * their very first request, before any DB row exists for it — so "I have a
 * cookie" does NOT mean "I have a workspace yet". This resolves to that row
 * if it exists, otherwise falls back to the seeded demo, exactly like
 * `getViewingWorkspaceId`, just also returning the full row for the shell.
 */
export async function loadViewingWorkspace() {
  const workspaceId = await getViewingWorkspaceId();
  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (!workspace) {
    throw new Error(`Viewing workspace ${workspaceId} does not exist — demo data may not be seeded.`);
  }
  return workspace;
}

/**
 * For the one write path that should be gated on onboarding: starting a real
 * test meeting. Only a visitor whose *own* workspace row exists but hasn't
 * finished the walkthrough is sent there — someone merely browsing the demo
 * is never redirected just for having a cookie.
 */
export async function requireOwnOnboardedWorkspace(next = "/room") {
  const ownId = await getWorkspaceId();
  if (!ownId) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, ownId) });
  if (!workspace || !workspace.onboardedAt) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return workspace;
}
