"use client";

import { useEffect, useRef } from "react";
import { cn, formatTimecode, speakerHue } from "@/lib/utils";
import type { TranscriptLine } from "./types";

export function TranscriptPanel({ lines, notetakerName }: { lines: TranscriptLine[]; notetakerName: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, lines[lines.length - 1]?.text]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      {lines.length === 0 && <p className="text-sm text-muted-foreground">Transcript will appear here as the call happens…</p>}
      <div className="flex flex-col gap-3">
        {lines.map((line) => {
          const isNotetaker = line.speaker === notetakerName;
          const hue = speakerHue(line.speaker);
          return (
            <div key={line.id} className={cn("animate-fade-up text-sm", !line.final && "opacity-60")}>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn("text-xs font-semibold", isNotetaker && "text-accent")}
                  style={!isNotetaker ? { color: `hsl(${hue} 70% 65%)` } : undefined}
                >
                  {line.speaker}
                </span>
                <span className="text-[10px] text-muted-foreground">{formatTimecode(line.startMs / 1000)}</span>
              </div>
              <p className="mt-0.5 text-foreground/90">{line.text}</p>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
