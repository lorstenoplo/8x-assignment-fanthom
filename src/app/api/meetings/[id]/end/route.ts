import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, isNull, and } from "drizzle-orm";
import { processMeeting } from "@/server/meetings";
import { requireOwnMeeting } from "@/server/meeting-guard";

/**
 * Ends the meeting, closes out anyone still marked present, and kicks off
 * processing synchronously. Vercel functions have a hard time limit, so for a
 * long call this is the thing most likely to need a queue in a real product —
 * called out explicitly in the walkthrough rather than silently timing out.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;
  const { meeting } = guard;
  if (meeting.status !== "live") return NextResponse.json({ meeting });

  const now = new Date();
  // The server's clock runs from row creation to this request, which also
  // counts call setup and the recording upload. The room reports the actual
  // recorded length; it's trusted only within what the server clock allows.
  const serverElapsedSec = Math.max(1, Math.round((now.getTime() - meeting.startedAt.getTime()) / 1000));
  const body = (await req.json().catch(() => ({}))) as { durationSec?: unknown };
  const reported = typeof body.durationSec === "number" && Number.isFinite(body.durationSec) ? Math.round(body.durationSec) : null;
  const durationSec = reported !== null ? Math.min(Math.max(1, reported), serverElapsedSec) : serverElapsedSec;

  await db
    .update(schema.participants)
    .set({ leftAt: now })
    .where(and(eq(schema.participants.meetingId, id), isNull(schema.participants.leftAt)));

  await db.update(schema.meetings).set({ endedAt: now, durationSec }).where(eq(schema.meetings.id, id));

  const { errors } = await processMeeting(id);

  const final = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  return NextResponse.json({ meeting: final, processingErrors: errors });
}
