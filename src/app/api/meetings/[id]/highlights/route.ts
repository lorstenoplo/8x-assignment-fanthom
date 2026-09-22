import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireOwnMeeting } from "@/server/meeting-guard";

const HighlightBody = z.object({
  label: z.string().max(120).default("Highlight"),
  note: z.string().max(2000).optional(),
  startMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000),
  endMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000),
  createdDuringCall: z.boolean().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnMeeting(id);
  if ("error" in guard) return guard.error;

  const body = HighlightBody.parse(await req.json());

  const [highlight] = await db
    .insert(schema.highlights)
    .values({
      meetingId: id,
      label: body.label,
      note: body.note,
      startMs: body.startMs,
      endMs: Math.max(body.endMs, body.startMs + 1000),
      createdDuringCall: body.createdDuringCall,
    })
    .returning();

  return NextResponse.json({ highlight });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await db.query.highlights.findMany({
    where: eq(schema.highlights.meetingId, id),
    orderBy: (t, { asc }) => asc(t.startMs),
  });
  return NextResponse.json({ highlights: list });
}
