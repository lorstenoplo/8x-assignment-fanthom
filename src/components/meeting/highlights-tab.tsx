"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/lib/utils";
import type { Highlight } from "@/lib/db/schema";

export function HighlightsTab({
  meetingId,
  highlights,
  onSeek,
}: {
  meetingId: string;
  highlights: Highlight[];
  onSeek: (ms: number) => void;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function shareClip(h: Highlight) {
    setCreating(h.id);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, scope: "clip", title: h.label, startMs: h.startMs, endMs: h.endMs }),
      });
      const { link } = (await res.json()) as { link: { token: string } };
      const url = `${window.location.origin}/s/${link.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(h.id);
      toast.success("Clip link copied — shareable with anyone, even if they weren't on the call.");
      setTimeout(() => setCopied(null), 2500);
    } catch {
      toast.error("Couldn't create a share link.");
    } finally {
      setCreating(null);
    }
  }

  if (highlights.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No highlights yet — press &ldquo;Highlight&rdquo; during a live call to mark a moment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {highlights.map((h) => (
        <div key={h.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Bookmark className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <button onClick={() => onSeek(h.startMs)} className="text-sm font-medium hover:text-accent">
              {h.label}
            </button>
            <p className="text-xs text-muted-foreground">
              {formatTimecode(h.startMs / 1000)} – {formatTimecode(h.endMs / 1000)}
              {h.createdDuringCall && " · marked live"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => shareClip(h)} disabled={creating === h.id}>
            {creating === h.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : copied === h.id ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            {copied === h.id ? "Copied" : "Share clip"}
          </Button>
        </div>
      ))}
    </div>
  );
}
