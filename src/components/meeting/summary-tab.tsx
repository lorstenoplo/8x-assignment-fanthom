"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatTimecode } from "@/lib/utils";
import { TEMPLATES, TEMPLATE_IDS, type TemplateId } from "@/server/ai/templates";
import type { SummaryContent } from "@/lib/db/schema";

export function SummaryTab({
  meetingId,
  initialSummary,
  initialError,
  hasTranscript,
  onSeek,
}: {
  meetingId: string;
  initialSummary: SummaryContent | null;
  initialError: string | null;
  hasTranscript: boolean;
  onSeek: (ms: number) => void;
}) {
  const [template, setTemplate] = useState<TemplateId>("general");
  const [cache, setCache] = useState<Partial<Record<TemplateId, SummaryContent>>>(
    initialSummary ? { general: initialSummary } : {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const summary = cache[template];

  async function load(t: TemplateId, regenerate = false) {
    setTemplate(t);
    if (cache[t] && !regenerate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/summary${regenerate ? "" : `?template=${t}`}`, {
        method: regenerate ? "POST" : "GET",
        headers: regenerate ? { "Content-Type": "application/json" } : undefined,
        body: regenerate ? JSON.stringify({ template: t }) : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "generation_failed");
        return;
      }
      const data = (await res.json()) as { content: SummaryContent };
      setCache((prev) => ({ ...prev, [t]: data.content }));
    } catch {
      setError("generation_failed");
      toast.error("Couldn't generate that summary.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasTranscript) {
    return <EmptyNote text="Summaries need a transcript first — this meeting doesn't have one yet." />;
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <p className="mb-2 text-label-sm text-on-surface-variant">Summary style — rewrites the same transcript for this meeting&apos;s format</p>
        <div className="flex flex-wrap items-center gap-2">
          {TEMPLATE_IDS.map((t) => (
            <button
              key={t}
              onClick={() => load(t)}
              title={TEMPLATES[t].description}
              className={cn(
                "rounded-full px-4 py-1.5 text-label-sm transition-colors",
                template === t ? "bg-obsidian text-on-obsidian" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container",
              )}
            >
              {TEMPLATES[t].label}
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => load(template, true)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Regenerate
          </Button>
        </div>
      </div>

      {loading && !summary && (
        <div className="flex items-center gap-2 py-8 text-body-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Generating summary…
        </div>
      )}

      {error && !summary && (
        <EmptyNote
          text={
            error === "ai_not_configured"
              ? "Summaries need GEMINI_API_KEY set — add it to .env.local and restart."
              : "Couldn't generate a summary for this meeting."
          }
        />
      )}

      {summary && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#EBFBF5] p-5">
            <span className="text-label-md font-semibold text-[#0A6B4F]">Executive AI Summary</span>
            <h3 className="mt-2 text-headline-sm text-on-surface">{summary.headline}</h3>
            <p className="mt-1.5 text-body-sm leading-relaxed text-on-surface-variant">{summary.purpose}</p>
          </div>
          {summary.sections.map((section, i) => (
            <div key={i}>
              <h4 className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">{section.heading}</h4>
              <ul className="mt-2 space-y-2">
                {section.bullets.map((b, j) => (
                  <li key={j} className="flex items-start gap-2 text-body-sm text-on-surface">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                    <span className="flex-1">{b.text}</span>
                    {b.startMs != null && (
                      <button
                        onClick={() => onSeek(b.startMs!)}
                        className="shrink-0 rounded-full bg-surface-container-low px-2 py-0.5 text-label-sm tabular-nums text-on-surface-variant hover:bg-primary-fixed hover:text-on-primary-fixed"
                      >
                        {formatTimecode(b.startMs! / 1000)}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <AlertTriangle className="h-5 w-5 text-on-surface-variant" />
      <p className="max-w-xs text-body-sm text-on-surface-variant">{text}</p>
    </div>
  );
}
