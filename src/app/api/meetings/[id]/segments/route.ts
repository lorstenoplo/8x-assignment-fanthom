import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const SegmentBody = z.object({
  speaker: z.string().min(1),
  participantId: z.string().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  isFinal: z.boolean().default(true),
});

/** Appends one transcript line, streamed live from the room as speech resolves. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = SegmentBody.parse(await req.json());
  if (!body.text.trim()) return NextResponse.json({ skipped: true });

  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
