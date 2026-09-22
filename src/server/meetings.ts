import "server-only";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { indexMeeting } from "@/server/ai";
import { scanMeetingForAlerts } from "@/server/ai/alerts";
import { generateSummary, generateActionItems } from "@/server/ai/summarize";
import type { TemplateId } from "@/server/ai/templates";
import { TEMPLATE_IDS } from "@/server/ai/templates";

/**
 * Runs after a meeting ends: index for retrieval, generate the default
 * summary + action items, then scan alerts (which needs the fresh index).
 * Each step is independent — one failing doesn't roll back the others, since
 * a meeting with a working transcript but a failed summary is still useful,
 * and the UI can retry summary generation on demand.
 */
export async function processMeeting(meetingId: string) {
  await db.update(schema.meetings).set({ status: "processing" }).where(eq(schema.meetings.id, meetingId));

  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId) });
  if (!meeting) throw new Error(`processMeeting: no such meeting ${meetingId}`);
  const workspace = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, meeting.workspaceId) });

  const errors: string[] = [];

  try {
    await indexMeeting(meetingId);
  } catch (e) {
    errors.push(`indexing: ${(e as Error).message}`);
  }

  const defaultTemplate: TemplateId = TEMPLATE_IDS.includes(workspace?.defaultTemplate as TemplateId)
    ? (workspace!.defaultTemplate as TemplateId)
    : "general";

  try {
    await generateSummary(meetingId, defaultTemplate);
  } catch (e) {
    errors.push(`summary: ${(e as Error).message}`);
  }

  try {
    await generateActionItems(meetingId);
  } catch (e) {
    errors.push(`action items: ${(e as Error).message}`);
  }

  try {
    await scanMeetingForAlerts(meetingId, meeting.workspaceId);
  } catch (e) {
    errors.push(`alerts: ${(e as Error).message}`);
  }

  await db
    .update(schema.meetings)
    .set({
      status: errors.length > 0 ? "ready" : "ready",
      processingError: errors.length > 0 ? errors.join(" | ") : null,
    })
    .where(eq(schema.meetings.id, meetingId));

  return { errors };
}
