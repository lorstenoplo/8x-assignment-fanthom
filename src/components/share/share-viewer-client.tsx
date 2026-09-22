"use client";

import { Mic, Calendar } from "lucide-react";
import { formatDuration, formatTimecode } from "@/lib/utils";
import type { Meeting, ShareLink, TranscriptSegment, SummaryContent } from "@/lib/db/schema";

export function ShareViewerClient({
  meeting,
  link,
  segments,
  summary,
}: {
  meeting: Meeting;
  link: ShareLink;
  segments: TranscriptSegment[];
  summary: SummaryContent | null;
}) {
  const isClip = link.scope === "clip";
  const startSec = isClip && link.startMs != null ? link.startMs / 1000 : 0;
  const endSec = isClip && link.endMs != null ? link.endMs / 1000 : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Mic className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold">Fathom Clone</span>
        <span className="ml-auto text-xs text-muted-foreground">Shared {isClip ? "clip" : "recording"}</span>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight">{link.title || meeting.title}</h1>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(meeting.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <span>{formatDuration(meeting.durationSec)}</span>
        </div>

        <div className="mt-5">
          {meeting.recordingUrl ? (
            <video
              src={`${meeting.recordingUrl}#t=${startSec}`}
              controls
              className="aspect-video w-full rounded-[var(--radius-lg)] bg-black"
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = startSec;
              }}
              onTimeUpdate={(e) => {
                if (endSec && e.currentTarget.currentTime >= endSec) e.currentTarget.pause();
              }}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              No recording available for this {isClip ? "clip" : "meeting"}.
            </div>
          )}
        </div>

        {summary && (
          <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{summary.headline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{summary.purpose}</p>
            {summary.sections.map((s, i) => (
              <div key={i} className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.heading}</h3>
                <ul className="mt-2 space-y-1.5">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2 text-sm">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {b.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {segments.length > 0 && (
          <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript</h2>
            <div className="flex flex-col gap-3">
              {segments.map((s) => (
                <div key={s.id} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-accent">{s.speaker}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTimecode(s.startMs / 1000)}</span>
                  </div>
                  <p className="mt-0.5 text-foreground/85">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
