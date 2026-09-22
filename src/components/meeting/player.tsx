"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Play, Pause } from "lucide-react";
import { cn, formatTimecode } from "@/lib/utils";
import type { Meeting } from "@/lib/db/schema";

/**
 * Wraps a real <video> when a recording exists. When it doesn't — mic denied,
 * upload failed, or a seeded meeting with no capture — playback falls back to
 * a plain elapsed-time clock driven by the same play/pause/seek controls, so
 * the transcript-sync UI below still works instead of the page half-breaking.
 */
export function MeetingPlayer({
  meeting,
  currentMs,
  onTimeChange,
  seekToMs,
}: {
  meeting: Meeting;
  currentMs: number;
  onTimeChange: (ms: number) => void;
  seekToMs: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const durationMs = meeting.durationSec * 1000;
  const hasRecording = !!meeting.recordingUrl;

  useEffect(() => {
    if (seekToMs == null) return;
    if (hasRecording && videoRef.current) {
      videoRef.current.currentTime = seekToMs / 1000;
    } else {
      onTimeChange(seekToMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekToMs]);

  // Fallback clock when there's no recording to drive playback.
  useEffect(() => {
    if (hasRecording || !playing) return;
    const start = Date.now() - currentMs;
    const t = setInterval(() => {
      const next = Date.now() - start;
      if (next >= durationMs) {
        setPlaying(false);
        onTimeChange(durationMs);
      } else {
        onTimeChange(next);
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, hasRecording]);

  if (hasRecording) {
    return (
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-black">
        <video
          ref={videoRef}
          src={meeting.recordingUrl!}
          controls
          className="aspect-video w-full"
          onTimeUpdate={(e) => onTimeChange(e.currentTarget.currentTime * 1000)}
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-muted/30 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">No recording for this meeting</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {meeting.recordingNote || "Capture wasn't stored for this call — the transcript below still syncs with playback position."}
        </p>
      </div>
      <div className="flex w-full max-w-xs items-center gap-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="relative h-1.5 flex-1 rounded-full bg-muted">
          <div
            className="absolute h-full rounded-full bg-accent"
            style={{ width: `${durationMs ? Math.min(100, (currentMs / durationMs) * 100) : 0}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {formatTimecode(currentMs / 1000)}
        </span>
      </div>
    </div>
  );
}

export function seekBadgeClass(active: boolean) {
  return cn(
    "cursor-pointer rounded px-1 text-[10px] font-medium tabular-nums transition-colors",
    active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-accent-soft hover:text-accent",
  );
}
