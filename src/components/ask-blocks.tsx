"use client";

import Link from "next/link";
import { Video, CheckCircle2 } from "lucide-react";
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
    <div className="mt-2.5 flex flex-col gap-2">
      {blocks.map((b, i) => {
        if (b.type === "meeting_card") {
          return (
            <Link
              key={i}
              href={`/m/${b.meetingId}${b.startMs != null ? `?t=${b.startMs}` : ""}`}
              className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-xs transition-colors hover:border-accent/50"
            >
              <Video className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
              {b.startMs != null && <span className="shrink-0 text-muted-foreground">{formatTimecode(b.startMs / 1000)}</span>}
            </Link>
          );
        }
        if (b.type === "action_items") {
          return (
            <div key={i} className="rounded-[var(--radius-md)] border border-border bg-background p-2.5">
              {b.items.map((item, j) => (
                <div key={j} className="flex items-start gap-2 py-0.5 text-xs">
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
            <div key={i} className="flex items-baseline gap-2 rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-xs">
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
