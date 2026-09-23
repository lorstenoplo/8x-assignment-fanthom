"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn, formatTimecode } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import type { TranscriptSegment } from "@/lib/db/schema";

/** After you scroll the transcript yourself, auto-follow waits this long before taking over again. */
const MANUAL_SCROLL_GRACE_MS = 4000;

export function SyncedTranscript({
  segments,
  currentMs,
  onSeek,
}: {
  segments: TranscriptSegment[];
  currentMs: number;
  onSeek: (ms: number) => void;
}) {
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const lastManualScrollRef = useRef(0);

  const sorted = useMemo(() => [...segments].sort((a, b) => a.startMs - b.startMs), [segments]);
  const speakers = useMemo(() => Array.from(new Set(sorted.map((s) => s.speaker))), [sorted]);

  // The line being spoken is the last one that has started by now.
  const activeId = useMemo(() => {
    let active: string | null = null;
    for (const s of sorted) {
      if (s.startMs <= currentMs) active = s.id;
      else break;
    }
    return active;
  }, [sorted, currentMs]);

  // Scroll only the transcript list, never the page. `scrollIntoView` also
  // scrolls every ancestor, so the whole page jumped around during playback.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId) return;
    if (Date.now() - lastManualScrollRef.current < MANUAL_SCROLL_GRACE_MS) return;
    const el = list.querySelector<HTMLElement>(`[data-seg="${activeId}"]`);
    if (!el) return;
    const target = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeId]);

  if (sorted.length === 0) {
    return <p className="p-5 text-body-sm text-on-surface-variant">No transcript was captured for this meeting.</p>;
  }

  const query = q.trim().toLowerCase();
  const filtered = sorted.filter((s) => (!speakerFilter || s.speaker === speakerFilter) && (!query || s.text.toLowerCase().includes(query)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2.5 border-b border-outline-variant/40 p-4">
        <div className="flex items-center justify-between">
          <span className="text-label-sm font-semibold text-on-surface">Transcript</span>
          <span className="text-label-sm text-on-surface-variant">
            {speakers.length} {speakers.length === 1 ? "Speaker" : "Speakers"}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search spoken text..."
            className="w-full rounded-full bg-surface-container-low py-1.5 pl-8 pr-3 text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={speakerFilter === null} onClick={() => setSpeakerFilter(null)} />
          {speakers.map((s) => (
            <FilterChip key={s} label={s} active={speakerFilter === s} onClick={() => setSpeakerFilter(s)} />
          ))}
        </div>
      </div>

      <div
        ref={listRef}
        onWheel={() => (lastManualScrollRef.current = Date.now())}
        onTouchMove={() => (lastManualScrollRef.current = Date.now())}
        className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
      >
        {filtered.length === 0 && <p className="p-2 text-body-sm text-on-surface-variant">No lines match.</p>}
        {filtered.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              data-seg={s.id}
              onClick={() => {
                lastManualScrollRef.current = 0;
                onSeek(s.startMs);
              }}
              className={cn(
                "flex w-full gap-3 rounded-lg p-3 text-left transition-colors",
                active ? "bg-primary-fixed/60" : "hover:bg-surface-container-low",
              )}
            >
              <Avatar name={s.speaker} size={28} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-label-sm font-semibold text-on-surface">{s.speaker}</span>
                  <span className={cn("text-label-sm tabular-nums", active ? "font-semibold text-primary" : "text-on-surface-variant")}>
                    {formatTimecode(s.startMs / 1000)}
                  </span>
                </div>
                <p className={cn("mt-0.5 text-body-sm leading-relaxed", active ? "text-on-surface" : "text-on-surface-variant")}>{s.text}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-label-sm transition-colors",
        active ? "bg-obsidian text-on-obsidian" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container",
      )}
    >
      {label}
    </button>
  );
}
