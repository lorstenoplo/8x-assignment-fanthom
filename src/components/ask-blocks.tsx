"use client";

import Link from "next/link";
import { Video, CheckCircle2, ChevronRight } from "lucide-react";
import { formatTimecode } from "@/lib/utils";
import type { AskUiBlock } from "@/lib/db/schema";

/**
 * "Generative UI": the model decides, per answer, whether a meeting card or
 * an action-items block belongs under the markdown text — this renders
 * whichever typed blocks it chose, rather than the answer always being flat
 * text.
 */
export function AskBlocks({ blocks }: { blocks: AskUiBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {blocks.map((b, i) => {
        if (b.type === "meeting_card") {
          return (
            <Link
              key={i}
              href={`/m/${b.meetingId}${b.startMs != null ? `?t=${b.startMs}` : ""}`}
              className="group flex items-center gap-2.5 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-xs transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Video className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
              {b.startMs != null && <span className="shrink-0 text-muted-foreground">{formatTimecode(b.startMs / 1000)}</span>}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        }
        if (b.type === "action_items") {
          return (
            <div key={i} className="rounded-2xl border border-border bg-background p-3">
              {b.items.map((item, j) => (
                <div key={j} className="flex items-start gap-2 py-1 text-xs">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="flex-1">{item.text}</span>
                  {item.assignee && <span className="shrink-0 text-muted-foreground">{item.assignee}</span>}
                </div>
              ))}
            </div>
          );
        }
        if (b.type === "stat") {
          return (
            <div key={i} className="flex items-baseline gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-xs">
              <span className="font-semibold text-accent">{b.value}</span>
              <span className="text-muted-foreground">{b.label}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
