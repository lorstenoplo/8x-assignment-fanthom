import "server-only";
import { db, schema } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { embedText } from "./embeddings";
import type { Citation } from "@/lib/db/schema";

export type RetrievalContext = {
  workspaceId: string;
  /** True if a guest is currently in the room asking. Unset for Ask/Search, which run outside any call. */
  externalPresent?: boolean;
  /** Email of whoever is asking, if known — lets a guest retrieve meetings they themselves attended. */
  askerEmail?: string | null;
};

export type RetrievedChunk = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  text: string;
  startMs: number;
  score: number;
};

/**
 * The one guardrail chokepoint: every retrieval path (search, Ask, the in-call
 * agent) calls this, and filtering happens in the SQL predicate — a chunk that
 * doesn't pass never enters the model's context, so it cannot be leaked by a
 * clever prompt downstream.
 *
 * Rule: with a guest in the room, only chunks from meetings that are (a) not
 * confidential, and (b) either had no external attendee at all, or included
 * this exact asker, are eligible. Outside a live call (Search/Ask, run by the
 * workspace owner), the guard is off — those are the owner's own meetings.
 */
export async function retrieve(
  query: string,
  ctx: RetrievalContext,
  limit = 6,
): Promise<RetrievedChunk[]> {
  const embedding = await embedText(query, "RETRIEVAL_QUERY");
  const distance = sql<number>`${schema.chunks.embedding} <=> ${JSON.stringify(embedding)}::vector`;

  const guardPredicate = ctx.externalPresent
    ? and(
        eq(schema.chunks.confidential, false),
        sql`(
          ${schema.chunks.hadExternal} = false
          OR ${schema.chunks.attendeeEmails} @> ${JSON.stringify(ctx.askerEmail ? [ctx.askerEmail] : [])}::jsonb
        )`,
      )
    : sql`true`;

  const rows = await db
    .select({
      id: schema.chunks.id,
      meetingId: schema.chunks.meetingId,
      meetingTitle: schema.meetings.title,
      text: schema.chunks.text,
      startMs: schema.chunks.startMs,
      score: sql<number>`1 - (${distance})`,
    })
    .from(schema.chunks)
    .innerJoin(schema.meetings, eq(schema.meetings.id, schema.chunks.meetingId))
    .where(and(eq(schema.chunks.workspaceId, ctx.workspaceId), guardPredicate))
    .orderBy(distance)
    .limit(limit);

  return rows;
}

export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((c) => ({
    meetingId: c.meetingId,
    meetingTitle: c.meetingTitle,
    startMs: c.startMs,
    snippet: c.text.slice(0, 220),
  }));
}
