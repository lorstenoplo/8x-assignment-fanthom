"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Calendar, Users2, Link2, Check, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatDuration } from "@/lib/utils";
import { MeetingPlayer } from "./player";
import { SyncedTranscript } from "./synced-transcript";
import { SummaryTab } from "./summary-tab";
import { ActionItemsTab } from "./action-items-tab";
import { HighlightsTab } from "./highlights-tab";
import type { MeetingDetailProps } from "./types";

const TABS = ["Summary", "Transcript", "Action items", "Highlights"] as const;
type Tab = (typeof TABS)[number];

export function MeetingDetailClient({
  meeting,
  participants,
  segments,
  actionItems,
  highlights,
  initialSummary,
  summaryError,
}: MeetingDetailProps) {
  const [tab, setTab] = useState<Tab>("Summary");
  const [currentMs, setCurrentMs] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  function seek(ms: number) {
    setSeekTo(ms);
    setCurrentMs(ms);
  }

  async function shareMeeting() {
    setSharing(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id, scope: "meeting", title: meeting.title }),
      });
      const { link } = (await res.json()) as { link: { token: string } };
      const url = `${window.location.origin}/s/${link.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      toast.success("Share link copied — works for anyone, signed in or not.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't create a share link.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{meeting.title}</h1>
            {meeting.hadExternal && (
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> External attendee
              </Badge>
            )}
            {meeting.processingError && <Badge variant="warning">Partial processing</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(meeting.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            <span>{formatDuration(meeting.durationSec)}</span>
            <span className="flex items-center gap-1">
              <Users2 className="h-3 w-3" /> {participants.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden -space-x-2 sm:flex">
            {participants.map((p) => (
              <Avatar key={p.id} name={p.name} size={28} className="ring-2 ring-background" />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={shareMeeting} disabled={sharing}>
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Copied" : "Share"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <MeetingPlayer meeting={meeting} currentMs={currentMs} onTimeChange={setCurrentMs} seekToMs={seekTo} />
          <div className="rounded-[var(--radius-lg)] border border-border bg-card">
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === t ? "bg-accent-soft text-accent" : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {tab === "Summary" && (
                <SummaryTab
                  meetingId={meeting.id}
                  initialSummary={initialSummary}
                  initialError={summaryError}
                  hasTranscript={segments.length > 0}
                  onSeek={seek}
                />
              )}
              {tab === "Transcript" && <SyncedTranscript segments={segments} currentMs={currentMs} onSeek={seek} />}
              {tab === "Action items" && <ActionItemsTab items={actionItems} onSeek={seek} />}
              {tab === "Highlights" && <HighlightsTab meetingId={meeting.id} highlights={highlights} onSeek={seek} />}
            </div>
          </div>
        </div>

        <div className="hidden max-h-[600px] flex-col overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-card lg:flex">
          <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Transcript
          </div>
          <SyncedTranscript segments={segments} currentMs={currentMs} onSeek={seek} />
        </div>
      </div>
    </div>
  );
}
