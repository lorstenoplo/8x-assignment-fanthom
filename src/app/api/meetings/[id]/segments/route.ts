import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireOwnMeeting } from "@/server/meeting-guard";

const SegmentBody = z.object({
  speaker: z.string().min(1).max(80),
  participantId: z.string().max(100).optional(),
  startMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000),
  endMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000),
  text: z.string().max(4000),
  isFinal: z.boolean().default(true),
});

/** Appends one transcript line, streamed live from the room as speech resolves. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = SegmentBody.parse(await req.json());
  if (!body.text.trim()) return NextResponse.json({ skipped: true });

  const [segment] = await db
    .insert(schema.transcriptSegments)
    .values({
      meetingId: id,
      speaker: body.speaker,
      participantId: body.participantId,
      startMs: body.startMs,
      endMs: body.endMs,
      text: body.text,
      isFinal: body.isFinal,
    })
    .returning();

  return NextResponse.json({ segment });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const segments = await db.query.transcriptSegments.findMany({
    where: eq(schema.transcriptSegments.meetingId, id),
    orderBy: (t, { asc }) => asc(t.startMs),
  });
  return NextResponse.json({ segments });
}
