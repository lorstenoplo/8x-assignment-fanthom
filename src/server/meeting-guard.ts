import "server-only";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getWorkspaceId } from "@/server/session";
import type { Meeting } from "@/lib/db/schema";

/**
 * IDOR guard for every meeting-scoped write. Meeting ids are UUIDs, not
 * secrets on their own — a link, a screenshot, or a referrer header can leak
 * one — so every endpoint that mutates a meeting (transcript, participants,
 * highlights, in-call answers, ending the call, recording upload, toggling
 * an action item, regenerating a summary) confirms the request's own
 * workspace cookie actually owns it before touching anything. There is no
 * login here, so "own workspace" is the whole trust boundary; skipping this
 * check would let anyone who obtains a meeting id tamper with someone else's
 * data, including the public demo's.
 */
export async function requireOwnMeeting(
  meetingId: string,
): Promise<{ meeting: Meeting } | { error: NextResponse }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId) });
  if (!meeting) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  if (meeting.workspaceId !== workspaceId) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { meeting };
}

/** Looser check for reads that also generate (and cost money) — own meeting, or the public demo's. */
export async function requireViewableMeeting(
  meetingId: string,
): Promise<{ meeting: Meeting } | { error: NextResponse }> {
  const workspaceId = await getWorkspaceId();
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId) });
  if (!meeting) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  const isDemo = meeting.workspaceId === process.env.DEMO_WORKSPACE_ID;
  if (!isDemo && meeting.workspaceId !== workspaceId) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { meeting };
}
