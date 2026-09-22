import "server-only";
import { db, schema } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { embedText } from "./embeddings";

/**
 * Runs every active alert in the workspace against one meeting's freshly
 * indexed chunks. Called right after `indexMeeting`. A chunk can match on
 * either signal: cosine similarity past the alert's threshold, or a literal
 * keyword hit — so "mentions the word 'churn'" and "sounds like a churn risk"
 * both work, one exact, one semantic.
 */
export async function scanMeetingForAlerts(meetingId: string, workspaceId: string) {
  const [meetingAlerts, meetingChunks] = await Promise.all([
    db.query.alerts.findMany({ where: and(eq(schema.alerts.workspaceId, workspaceId), eq(schema.alerts.active, true)) }),
    db.query.chunks.findMany({ where: eq(schema.chunks.meetingId, meetingId) }),
  ]);
  if (meetingAlerts.length === 0 || meetingChunks.length === 0) return { hits: 0 };

  let hits = 0;
  for (const alert of meetingAlerts) {
    const embedding = alert.embedding ?? (await embedAndStoreAlert(alert.id, alert.query));
    for (const chunk of meetingChunks) {
      const score = chunk.embedding ? cosineSimilarity(embedding, chunk.embedding) : 0;
      const keywordHit = alert.keywords.some((k) => chunk.text.toLowerCase().includes(k.toLowerCase()));
      if (score < alert.threshold && !keywordHit) continue;

      await db
        .insert(schema.alertHits)
        .values({
          alertId: alert.id,
          meetingId,
          chunkId: chunk.id,
          snippet: chunk.text.slice(0, 300),
          score: keywordHit ? Math.max(score, alert.threshold) : score,
          startMs: chunk.startMs,
          matchedOn: keywordHit ? "keyword" : "semantic",
        })
        .onConflictDoNothing();
      hits++;
    }
  }
  return { hits };
}

async function embedAndStoreAlert(alertId: string, query: string) {
  const embedding = await embedText(query, "RETRIEVAL_QUERY");
  await db.update(schema.alerts).set({ embedding }).where(eq(schema.alerts.id, alertId));
  return embedding;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
