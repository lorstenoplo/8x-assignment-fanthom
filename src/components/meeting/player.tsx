"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Play, Pause, RotateCcw, Gauge } from "lucide-react";
import { formatTimecode } from "@/lib/utils";
import { Orb, Waveform } from "@/components/ui/waveform";
import type { Meeting } from "@/lib/db/schema";

/** A seek request. `id` changes on every click, so seeking to the same spot twice still works. */
export type SeekRequest = { ms: number; id: number };

const RATES = [1, 1.25, 1.5, 2];

/**
 * Wraps a real <video> when a recording exists. When it doesn't (mic denied,
 * upload failed, or a seeded meeting with no capture), playback falls back to
 * a plain clock driven by the same controls, so transcript sync still works.
 */
export function MeetingPlayer({
  meeting,
  currentMs,
  onTimeChange,
  seek,
}: {
  meeting: Meeting;
  currentMs: number;
  onTimeChange: (ms: number) => void;
  seek: SeekRequest | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const durationMs = meeting.durationSec * 1000;
  const hasRecording = !!meeting.recordingUrl;

  // Fallback clock: position = anchor + elapsed * rate, re-anchored on any
  // seek, so jumping while playing doesn't snap back on the next tick.
  const anchorRef = useRef({ ms: 0, at: 0 });

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    anchorRef.current = { ms: currentMs, at: Date.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  useEffect(() => {
    if (!seek) return;
    if (hasRecording) {
      const v = videoRef.current;
      // Setting currentTime before metadata has loaded is silently ignored.
      if (v && v.readyState >= 1) v.currentTime = seek.ms / 1000;
      else pendingSeekRef.current = seek.ms;
    } else {
      anchorRef.current = { ms: seek.ms, at: Date.now() };
      onTimeChange(seek.ms);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek]);

  useEffect(() => {
    if (hasRecording || !playing) return;
    anchorRef.current = { ms: currentMs, at: Date.now() };
    const t = setInterval(() => {
      const { ms, at } = anchorRef.current;
      const next = ms + (Date.now() - at) * rate;
      if (next >= durationMs) {
        setPlaying(false);
        onTimeChange(durationMs);
      } else {
        onTimeChange(next);
      }
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, hasRecording, rate, durationMs]);

  if (hasRecording) {
    return (
      <div className="overflow-hidden rounded-3xl bg-surface-container-lowest/80 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-label-md text-on-surface-variant">Meeting Recording</span>
          <button
            onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])}
            className="flex items-center gap-1 rounded-full bg-primary-fixed px-2.5 py-0.5 text-label-sm text-on-primary-fixed"
            aria-label="Playback speed"
          >
            <Gauge className="h-3.5 w-3.5" /> {rate}x
          </button>
        </div>
        <video
          ref={videoRef}
          src={meeting.recordingUrl!}
          controls
          preload="metadata"
          className="mt-3 aspect-video w-full bg-black"
          onLoadedMetadata={(e) => {
            e.currentTarget.playbackRate = rate;
            if (pendingSeekRef.current !== null) {
              e.currentTarget.currentTime = pendingSeekRef.current / 1000;
              pendingSeekRef.current = null;
            }
          }}
          onTimeUpdate={(e) => onTimeChange(e.currentTarget.currentTime * 1000)}
          onSeeked={(e) => onTimeChange(e.currentTarget.currentTime * 1000)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-3xl bg-surface-container-lowest/80 p-8 text-center shadow-sm backdrop-blur-md">
      <div className="flex w-full items-center justify-between">
        <span className="text-label-md text-on-surface-variant">Meeting Recording</span>
        <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 text-label-sm text-on-primary-fixed">Transcript playback</span>
      </div>

      <Orb size={112} pulse={playing} />

      <div className="w-full">
        <Waveform active={playing} progress={durationMs ? currentMs / durationMs : 0} className="w-full" />
        <div className="mt-1.5 flex w-full items-center justify-between text-label-sm text-on-surface-variant">
          <span className="tabular-nums">{formatTimecode(currentMs / 1000)}</span>
          <span className="tabular-nums">{formatTimecode(durationMs / 1000)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-on-surface-variant">
        <button
          onClick={() => {
            const next = Math.max(0, currentMs - 10_000);
            anchorRef.current = { ms: next, at: Date.now() };
            onTimeChange(next);
          }}
          className="transition-colors hover:text-on-surface"
          aria-label="Back 10 seconds"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (!playing && currentMs >= durationMs) onTimeChange(0);
            setPlaying((p) => !p);
          }}
          className="brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])}
          className="flex items-center gap-1 text-label-sm transition-colors hover:text-on-surface"
          aria-label="Playback speed"
        >
          <Gauge className="h-4 w-4" /> {rate}x
        </button>
      </div>

      {meeting.recordingNote && (
        <p className="flex items-center gap-1.5 text-label-sm text-on-surface-variant/80">
          <AlertTriangle className="h-3.5 w-3.5" /> {meeting.recordingNote}
        </p>
      )}
    </div>
  );
}
