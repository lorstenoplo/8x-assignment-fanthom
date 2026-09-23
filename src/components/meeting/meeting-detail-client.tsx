"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Users2, Link2, Check, Loader2, ShieldAlert, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatDuration, formatTimecode } from "@/lib/utils";
import { MeetingPlayer, type SeekRequest } from "./player";
import { SyncedTranscript } from "./synced-transcript";
import { SummaryTab } from "./summary-tab";
import { ActionItemsTab } from "./action-items-tab";
import { HighlightsTab } from "./highlights-tab";
import type { MeetingDetailProps } from "./types";

// Transcript is deliberately not a tab here — it's the always-visible panel
// on the right, synced to playback. A second copy of it under a tab was
// pure duplication (two scrollbars, two "active line" highlights).
const TABS = ["Summary", "Action items", "Highlights"] as const;
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
  const [seekTo, setSeekTo] = useState<SeekRequest | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  function seek(ms: number) {
    setSeekTo((prev) => ({ ms, id: (prev?.id ?? 0) + 1 }));
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

  function exportTranscript() {
    const lines = segments.map((s) => `[${formatTimecode(s.startMs / 1000)}] ${s.speaker}: ${s.text}`);
    const blob = new Blob([lines.join("\n") || "No transcript captured for this meeting."], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meeting.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <Link href="/calls" className="mb-4 inline-flex items-center gap-1.5 text-label-sm text-on-surface-variant transition-colors hover:text-on-surface">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Meetings
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-headline-lg tracking-tight text-on-surface">{meeting.title}</h1>
            <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 text-label-sm text-on-primary-fixed">
              {meeting.source === "seed" ? "Seed meeting" : "Test meeting"}
            </span>
            {meeting.hadExternal && (
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> External attendee
              </Badge>
            )}
            {meeting.processingError && <Badge variant="warning">Partial processing</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant">
            <span>
              {new Date(meeting.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            <span>· {formatDuration(meeting.durationSec)}</span>
            <span className="flex items-center gap-1">
              <Users2 className="h-3.5 w-3.5" /> {participants.length}
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
          <Button variant="outline" size="sm" onClick={exportTranscript}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <MeetingPlayer meeting={meeting} currentMs={currentMs} onTimeChange={setCurrentMs} seek={seekTo} />

          <div className="rounded-3xl bg-surface-container-lowest/80 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-1 border-b border-outline-variant/40 px-3 py-2">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-label-md transition-colors",
                    tab === t ? "bg-primary-fixed text-on-primary-fixed" : "text-on-surface-variant hover:bg-surface-container-low",
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
              {tab === "Action items" && <ActionItemsTab items={actionItems} onSeek={seek} />}
              {tab === "Highlights" && <HighlightsTab meetingId={meeting.id} highlights={highlights} onSeek={seek} />}
            </div>
          </div>
        </div>

        <div className="flex h-[560px] flex-col overflow-hidden rounded-3xl lg:h-[720px] bg-surface-container-lowest/80 shadow-sm backdrop-blur-md">
          <SyncedTranscript segments={segments} currentMs={currentMs} onSeek={seek} />
        </div>
      </div>
    </div>
  );
}
