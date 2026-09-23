import { NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getViewingWorkspaceId } from "@/server/session";
import { retrieve } from "@/server/ai/retrieval";
import { AiConfigError } from "@/server/ai/client";
import { rateLimit, clientKey } from "@/server/rate-limit";

const Query = z.object({ q: z.string().min(1).max(500) });
const TIMEOUT_MS = 20_000;

export type SearchResult = {
  meetingId: string;
  meetingTitle: string;
  quote: string;
  startMs: number;
  score: number;
  startedAt: string;
  durationSec: number;
  hadExternal: boolean;
  source: string;
  participantNames: string[];
  openActionItems: number;
};

/**
 * Semantic search over transcripts + summaries via the shared retrieval
 * chokepoint. Run outside any call, by the workspace owner browsing their own
 * meetings, so the guard is off (ctx.externalPresent unset) — same rule as Ask.
 *
 * `retrieve` returns individual chunk hits, which can include several from
 * the same meeting; this collapses to one card per meeting (its best-scoring
 * chunk as the quoted excerpt) and joins in the metadata a meeting-level
 * result card actually needs — duration, attendees, open action items.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({ q: url.searchParams.get("q") || "" });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const workspaceId = await getViewingWorkspaceId();
  const { allowed } = rateLimit(`search:${clientKey(req, workspaceId)}`, 30, 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const chunks = await Promise.race([
      retrieve(parsed.data.q, { workspaceId }, 24),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);

    const meetingIds = [...new Set(chunks.map((c) => c.meetingId))];
    const meetings = meetingIds.length
      ? await db.query.meetings.findMany({
          where: inArray(schema.meetings.id, meetingIds),
          with: { participants: true, actionItems: true },
        })
      : [];
    const byId = new Map(meetings.map((m) => [m.id, m]));

    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const c of chunks) {
      if (seen.has(c.meetingId)) continue;
      const m = byId.get(c.meetingId);
      if (!m) continue;
      seen.add(c.meetingId);
      results.push({
        meetingId: c.meetingId,
        meetingTitle: c.meetingTitle,
        quote: c.text,
        startMs: c.startMs,
        score: c.score,
        startedAt: m.startedAt.toISOString(),
        durationSec: m.durationSec,
        hadExternal: m.hadExternal,
        source: m.source,
        participantNames: m.participants.map((p) => p.name),
        openActionItems: m.actionItems.filter((a) => !a.done).length,
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof AiConfigError) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    console.error("search error", err);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
