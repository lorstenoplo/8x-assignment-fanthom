import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { MeetingDetailClient } from "@/components/meeting/meeting-detail-client";
import { getOrCreateSummary } from "@/server/ai/summarize";
import { AiConfigError } from "@/server/ai/client";
import type { SummaryContent } from "@/lib/db/schema";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, id) });
  if (!meeting) notFound();

  const [participants, segments, actionItems, highlights] = await Promise.all([
    db.query.participants.findMany({ where: eq(schema.participants.meetingId, id) }),
    db.query.transcriptSegments.findMany({
      where: eq(schema.transcriptSegments.meetingId, id),
      orderBy: [asc(schema.transcriptSegments.startMs)],
    }),
    db.query.actionItems.findMany({ where: eq(schema.actionItems.meetingId, id), orderBy: [asc(schema.actionItems.startMs)] }),
    db.query.highlights.findMany({ where: eq(schema.highlights.meetingId, id), orderBy: [asc(schema.highlights.startMs)] }),
  ]);

  let initialSummary: SummaryContent | null = null;
  let summaryError: string | null = null;
  if (segments.length > 0) {
    try {
      initialSummary = await getOrCreateSummary(id, "general");
    } catch (err) {
      summaryError = err instanceof AiConfigError ? "ai_not_configured" : "generation_failed";
    }
  }

  return (
    <MeetingDetailClient
      meeting={meeting}
      participants={participants}
      segments={segments}
      actionItems={actionItems}
      highlights={highlights}
      initialSummary={initialSummary}
      summaryError={summaryError}
    />
  );
}
