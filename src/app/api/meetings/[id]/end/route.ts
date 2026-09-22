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
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;
  const { meeting } = guard;
  if (meeting.status !== "live") return NextResponse.json({ meeting });

  const now = new Date();
  const durationSec = Math.max(1, Math.round((now.getTime() - meeting.startedAt.getTime()) / 1000));

  await db
    .update(schema.participants)
    .set({ leftAt: now })
    .where(and(eq(schema.participants.meetingId, id), isNull(schema.participants.leftAt)));

  await db.update(schema.meetings).set({ endedAt: now, durationSec }).where(eq(schema.meetings.id, id));

  const { errors } = await processMeeting(id);

  const final = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  return NextResponse.json({ meeting: final, processingErrors: errors });
}
