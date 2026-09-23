"use client";

import { useEffect, useRef } from "react";
import { cn, formatTimecode } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import type { TranscriptLine } from "./types";

/**
 * Subtitle/message-style feed: every line is its own bubble with its
 * speaker's name and avatar repeated each time, alternating sides by who's
 * talking — not grouped into one running paragraph per turn.
 */
export function TranscriptPanel({
  lines,
  notetakerName,
  ownerName,
}: {
  lines: TranscriptLine[];
  notetakerName: string;
  ownerName: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, lines[lines.length - 1]?.text]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-3">
      {lines.length === 0 && <p className="px-1 text-sm text-muted-foreground">Transcript will appear here as the call happens…</p>}
      <div className="flex flex-col gap-2.5">
        {lines.map((line) => {
          const isYou = line.speaker === ownerName;
          const isNotetaker = line.speaker === notetakerName;
          return (
            <div
              key={line.id}
              className={cn("flex animate-fade-up items-center gap-2", isYou ? "flex-row-reverse" : "flex-row", !line.final && "opacity-60")}
            >
              <Avatar name={line.speaker} size={26} className="shrink-0 self-center" />
              <div className={cn("flex max-w-[85%] flex-col", isYou && "items-end")}>
                <div className={cn("flex items-baseline gap-1.5 px-1", isYou && "flex-row-reverse")}>
                  <span className={cn("text-xs font-semibold", isNotetaker ? "text-accent" : "text-foreground/70")}>{line.speaker}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTimecode(line.startMs / 1000)}</span>
                </div>
                <p
                  className={cn(
                    // Uniform rounding regardless of length — a sharp "tail"
                    // corner (the usual chat-bubble convention) looked fine
                    // for a short line but visually broken next to a big,
                    // multi-line block of text once messages got longer.
                    "mt-1 break-words rounded-2xl px-6 py-4 text-sm leading-relaxed",
                    isYou ? "bg-accent text-accent-foreground" : "bg-muted text-foreground/90",
                  )}
                >
                  {line.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
