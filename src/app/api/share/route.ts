import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const CreateShare = z.object({
  meetingId: z.string(),
  scope: z.enum(["meeting", "clip"]).default("meeting"),
  title: z.string().optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  hideTranscript: z.boolean().default(false),
});

/**
 * Creates a public link — the mechanism for "share a clip with someone who
 * was not on the call". A clip link carries a range; the viewer page trims
 * playback to it. No auth on the viewer side by design: that's the point of
 * a share link, same as Fathom's.
 */
export async function POST(req: Request) {
  const body = CreateShare.parse(await req.json());
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, body.meetingId) });
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = randomBytes(9).toString("base64url");
  const [link] = await db
    .insert(schema.shareLinks)
    .values({
      meetingId: body.meetingId,
      token,
      scope: body.scope,
      title: body.title,
      startMs: body.startMs,
      endMs: body.endMs,
      hideTranscript: body.hideTranscript,
    })
    .returning();

  return NextResponse.json({ link });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const meetingId = url.searchParams.get("meetingId");
  if (!meetingId) return NextResponse.json({ links: [] });
  const links = await db.query.shareLinks.findMany({
    where: eq(schema.shareLinks.meetingId, meetingId),
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
  return NextResponse.json({ links });
}
