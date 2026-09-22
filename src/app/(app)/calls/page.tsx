import Link from "next/link";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { getViewingWorkspaceId } from "@/server/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDuration } from "@/lib/utils";
import { Video, Calendar, Users2, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const workspaceId = await getViewingWorkspaceId();
  const meetings = await db.query.meetings.findMany({
    where: eq(schema.meetings.workspaceId, workspaceId),
    orderBy: [desc(schema.meetings.startedAt)],
    with: { participants: true, actionItems: true },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Calls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meetings.length} meeting{meetings.length === 1 ? "" : "s"} captured
          </p>
        </div>
        <Link
          href="/room"
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
        >
          <Video className="h-4 w-4" />
          Start test meeting
        </Link>
      </div>

      {meetings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-2.5">
          {meetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Video className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">No meetings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Start a test meeting to see a real transcript, summary, and clips.</p>
        </div>
        <Link href="/room" className="mt-2 text-sm font-medium text-accent hover:underline">
          Start your first meeting →
        </Link>
      </CardContent>
    </Card>
  );
}

function MeetingRow({
  meeting,
}: {
  meeting: typeof schema.meetings.$inferSelect & {
    participants: (typeof schema.participants.$inferSelect)[];
    actionItems: (typeof schema.actionItems.$inferSelect)[];
  };
}) {
  const openItems = meeting.actionItems.filter((a) => !a.done).length;
  return (
    <Link href={`/m/${meeting.id}`}>
      <Card className="transition-colors hover:border-accent/50 hover:bg-muted/30">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-muted text-muted-foreground">
            <Video className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{meeting.title}</p>
              {meeting.status === "live" && <Badge variant="destructive">Live</Badge>}
              {meeting.status === "processing" && <Badge variant="warning">Processing</Badge>}
              {meeting.hadExternal && <Badge variant="outline">External</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(meeting.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span>{formatDuration(meeting.durationSec)}</span>
              <span className="flex items-center gap-1">
                <Users2 className="h-3 w-3" />
                {meeting.participants.length}
              </span>
              {openItems > 0 && (
                <span className="flex items-center gap-1 text-accent">
                  <CheckCircle2 className="h-3 w-3" />
                  {openItems} open
                </span>
              )}
            </div>
          </div>
          <div className="hidden -space-x-2 sm:flex">
            {meeting.participants.slice(0, 4).map((p) => (
              <Avatar key={p.id} name={p.name} size={26} className="ring-2 ring-card" />
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
