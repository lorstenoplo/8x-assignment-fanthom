"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUp, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { Citation } from "@/lib/db/schema";
import Link from "next/link";
import { formatTimecode } from "@/lib/utils";

type Message = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[] };

const SUGGESTIONS = ["What did we decide about pricing?", "Summarize what's blocked across my last few calls", "Who owns the open action items?"];

export function AskClient() {
  const [threadId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "ask_failed");
        return;
      }
      const { message } = (await res.json()) as { message: Message };
      setMessages((prev) => [...prev, { id: message.id, role: "assistant", content: message.content, citations: message.citations }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 py-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-accent" /> Try asking:
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-fit rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:border-accent/50 hover:text-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4 py-2">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[85%]"}>
              <div
                className={
                  m.role === "user"
                    ? "rounded-[var(--radius-lg)] bg-accent px-3.5 py-2 text-sm text-accent-foreground"
                    : "rounded-[var(--radius-lg)] bg-card px-3.5 py-2.5 text-sm"
                }
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                    {m.citations.map((c, i) => (
                      <Link
                        key={i}
                        href={`/m/${c.meetingId}`}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent-soft hover:text-accent"
                      >
                        {c.meetingTitle} · {formatTimecode(c.startMs / 1000)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          {error === "ai_not_configured" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> Ask needs GEMINI_API_KEY set.
            </p>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask anything about your meetings…"
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button size="icon" onClick={() => send(input)} disabled={loading || !input.trim()}>
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
