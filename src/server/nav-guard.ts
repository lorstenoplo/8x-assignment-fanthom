import "server-only";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getViewingWorkspaceId } from "@/server/session";

/**
 * Loads the workspace to render the shell with, and sends a first-time,
 * signed-in-as-yourself visitor to onboarding. A visitor browsing the seeded
 * demo workspace (no cookie of their own) is never redirected — the demo is
 * always onboarded, and that's the identity check: only *your own*,
 * not-yet-onboarded workspace forces the walkthrough.
 */
export async function requireOnboardedWorkspace() {
  const workspaceId = await getViewingWorkspaceId();
  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (!workspace) redirect("/onboarding");
  if (!workspace.isDemo && !workspace.onboardedAt) redirect("/onboarding");
  return workspace;
}
