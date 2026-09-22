import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq, asc, and, gte, lte } from "drizzle-orm";
import { ShareViewerClient } from "@/components/share/share-viewer-client";

export const dynamic = "force-dynamic";

export default async function ShareViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await db.query.shareLinks.findFirst({ where: eq(schema.shareLinks.token, token) });
  if (!link) notFound();
  if (link.revokedAt) return <Expired reason="This link has been revoked by its owner." />;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return <Expired reason="This link has expired." />;

  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, link.meetingId) });
  if (!meeting) notFound();

  await db
    .update(schema.shareLinks)
    .set({ views: link.views + 1 })
    .where(eq(schema.shareLinks.id, link.id));

  const isClip = link.scope === "clip" && link.startMs != null && link.endMs != null;

  const segments = link.hideTranscript
    ? []
    : await db.query.transcriptSegments.findMany({
        where: isClip
          ? and(
              eq(schema.transcriptSegments.meetingId, meeting.id),
              gte(schema.transcriptSegments.startMs, link.startMs! - 15_000),
              lte(schema.transcriptSegments.startMs, link.endMs! + 15_000),
            )
          : eq(schema.transcriptSegments.meetingId, meeting.id),
        orderBy: [asc(schema.transcriptSegments.startMs)],
      });

  const summary = await db.query.summaries.findFirst({
    where: and(eq(schema.summaries.meetingId, meeting.id), eq(schema.summaries.template, "general")),
  });

  return (
    <ShareViewerClient
      meeting={meeting}
      link={link}
      segments={segments}
      summary={summary?.content ?? null}
    />
  );
}

function Expired({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div>
        <p className="text-lg font-medium">Link unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
