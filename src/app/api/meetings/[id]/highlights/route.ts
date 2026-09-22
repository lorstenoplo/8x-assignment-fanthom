import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const HighlightBody = z.object({
  label: z.string().default("Highlight"),
  note: z.string().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  createdDuringCall: z.boolean().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = HighlightBody.parse(await req.json());
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
