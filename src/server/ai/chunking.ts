import "server-only";
import type { TranscriptSegment } from "@/lib/db/schema";

export type BuiltChunk = {
  text: string;
  speakers: string[];
  startMs: number;
  endMs: number;
};

/**
 * Groups consecutive transcript segments into ~45s windows with light
 * overlap, so a retrieved chunk reads as a coherent exchange instead of one
 * isolated line. Segment boundaries are always respected — a chunk never
 * splits mid-sentence.
 */
export function buildChunks(segments: TranscriptSegment[], windowMs = 45_000, overlapMs = 10_000): BuiltChunk[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  if (sorted.length === 0) return [];

  const chunks: BuiltChunk[] = [];
  let windowStart = sorted[0].startMs;
  let cursor = 0;

  while (cursor < sorted.length) {
    const windowEnd = windowStart + windowMs;
    const inWindow: TranscriptSegment[] = [];
    let i = cursor;
    while (i < sorted.length && sorted[i].startMs < windowEnd) {
      inWindow.push(sorted[i]);
      i++;
    }
    if (inWindow.length === 0) {
      // Gap larger than the window; jump to the next segment.
      windowStart = sorted[cursor]?.startMs ?? windowStart + windowMs;
      continue;
    }
    const text = inWindow.map((s) => `${s.speaker}: ${s.text}`).join("\n");
    const speakers = [...new Set(inWindow.map((s) => s.speaker))];
    chunks.push({
      text,
      speakers,
      startMs: inWindow[0].startMs,
      endMs: inWindow[inWindow.length - 1].endMs,
    });

    // Advance the window, but re-include the tail overlapMs of segments so a
    // fact near a boundary isn't only ever half-present in a chunk.
    const nextStart = windowEnd - overlapMs;
    let next = i;
    while (next > cursor && sorted[next - 1].startMs >= nextStart) next--;
    cursor = Math.max(next, cursor + 1);
    windowStart = sorted[cursor]?.startMs ?? windowEnd;
  }
  return chunks;
}
