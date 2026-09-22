"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn, formatTimecode, speakerHue } from "@/lib/utils";
import type { TranscriptSegment } from "@/lib/db/schema";

export function SyncedTranscript({
  segments,
  currentMs,
  onSeek,
}: {
  segments: TranscriptSegment[];
  currentMs: number;
  onSeek: (ms: number) => void;
}) {
  const activeId = useMemo(() => {
    let active: string | null = null;
    for (const s of segments) {
      if (s.startMs <= currentMs) active = s.id;
      else break;
    }
    return active;
  }, [segments, currentMs]);

  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeId]);

  if (segments.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No transcript was captured for this meeting.</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {segments.map((s) => {
        const active = s.id === activeId;
        const hue = speakerHue(s.speaker);
        return (
          <div
            key={s.id}
            ref={active ? activeRef : undefined}
            onClick={() => onSeek(s.startMs)}
            className={cn(
              "cursor-pointer rounded-[var(--radius-md)] px-2 py-1.5 text-sm transition-colors",
              active ? "bg-accent-soft" : "hover:bg-muted/50",
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold" style={{ color: `hsl(${hue} 70% 60%)` }}>
                {s.speaker}
              </span>
              <span className={cn("text-[10px] tabular-nums", active ? "text-accent" : "text-muted-foreground")}>
                {formatTimecode(s.startMs / 1000)}
              </span>
            </div>
            <p className={cn("mt-0.5", active ? "text-foreground" : "text-foreground/80")}>{s.text}</p>
          </div>
        );
      })}
    </div>
  );
}
