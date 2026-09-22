import "server-only";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { embedTexts } from "./embeddings";
import { buildChunks } from "./chunking";
import type { TranscriptSegment } from "@/lib/db/schema";

/**
 * Re-derives every retrieval chunk for a meeting and writes it, replacing
 * whatever was there. Called once processing finishes and again any time the
 * transcript changes (e.g. a seed script backfill).
 */
export async function indexMeeting(meetingId: string) {
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, meetingId) });
  if (!meeting) throw new Error(`indexMeeting: no such meeting ${meetingId}`);

  const segments: TranscriptSegment[] = await db.query.transcriptSegments.findMany({
    where: eq(schema.transcriptSegments.meetingId, meetingId),
  });
  const finalSegments = segments.filter((s) => s.isFinal);
  const built = buildChunks(finalSegments);

  await db.delete(schema.chunks).where(eq(schema.chunks.meetingId, meetingId));
  if (built.length === 0) return { chunks: 0 };

  const participants = await db.query.participants.findMany({
    where: eq(schema.participants.meetingId, meetingId),
  });
  const attendeeEmails = participants.map((p) => p.email).filter((e): e is string => !!e);

  const embeddings = await embedTexts(
    built.map((c) => c.text),
    "RETRIEVAL_DOCUMENT",
  );

  await db.insert(schema.chunks).values(
    built.map((c, i) => ({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.id,
      text: c.text,
      speakers: c.speakers,
      startMs: c.startMs,
      endMs: c.endMs,
      hadExternal: meeting.hadExternal,
      confidential: meeting.confidential,
      attendeeEmails,
      embedding: embeddings[i],
      tokens: Math.ceil(c.text.length / 4),
    })),
  );
  return { chunks: built.length };
}
