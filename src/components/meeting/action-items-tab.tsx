"use client";

import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn, formatTimecode } from "@/lib/utils";
import type { ActionItem } from "@/lib/db/schema";

export function ActionItemsTab({ items: initial, onSeek }: { items: ActionItem[]; onSeek: (ms: number) => void }) {
  const [items, setItems] = useState(initial);

  async function toggle(id: string, done: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    await fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }).catch(() => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !done } : i)));
    });
  }

  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No action items were found in this meeting.</p>;
  }

  return (
    <div className="flex flex-col gap-1 p-4">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 rounded-[var(--radius-md)] px-2 py-2 hover:bg-muted/40">
          <button onClick={() => toggle(item.id, !item.done)} className="mt-0.5 shrink-0 text-accent">
            {item.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", item.done && "text-muted-foreground line-through")}>{item.text}</p>
            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {item.assignee && <span>{item.assignee}</span>}
              {item.dueHint && <span>· {item.dueHint}</span>}
            </div>
          </div>
          {item.startMs != null && (
            <button
              onClick={() => onSeek(item.startMs!)}
              className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground hover:bg-accent-soft hover:text-accent"
            >
              {formatTimecode(item.startMs / 1000)}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
