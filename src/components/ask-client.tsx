"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2, AlertTriangle, ShieldAlert, Plus, History, Paperclip, Video, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Orb } from "@/components/ui/waveform";
import type { AskUiBlock, Citation } from "@/lib/db/schema";
import { cn, formatTimecode } from "@/lib/utils";
import { AskBlocks } from "@/components/ask-blocks";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  blocks?: AskUiBlock[];
  guardBlocked?: boolean;
};

type ThreadMeta = { id: string; title: string; updatedAt: number };
type MeetingOption = { id: string; title: string; startedAt: string; status: string };

const SUGGESTIONS = ["What did we decide about pricing?", "Summarize what's blocked across my last few calls", "Who owns the open action items?"];
const MAX_LEN = 2000;
const REQUEST_TIMEOUT_MS = 25_000;
const CURRENT_KEY = "aura_ask_current_thread";
const THREADS_KEY = "aura_ask_threads";

function loadThreads(): ThreadMeta[] {
  try {
    return JSON.parse(localStorage.getItem(THREADS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveThread(id: string, title: string) {
  try {
    const threads = loadThreads().filter((t) => t.id !== id);
    threads.unshift({ id, title: title.slice(0, 80), updatedAt: Date.now() });
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, 20)));
  } catch {
    // localStorage unavailable (private mode, etc) — history just won't persist
  }
}

export function AskClient() {
  const [threadId, setThreadId] = useState<string>("");
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attached, setAttached] = useState<MeetingOption | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) setAttachOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const existing = localStorage.getItem(CURRENT_KEY);
    const id = existing || crypto.randomUUID();
    setThreadId(id);
    setThreads(loadThreads());
    if (existing) loadThread(existing);
    else setLoadingThread(false);
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((d) => setMeetings(d.meetings ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function loadThread(id: string) {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/ask?threadId=${id}`);
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages ?? []);
      // A thread in the local history list that comes back empty belongs to
      // a workspace this browser no longer points at (or was cleared
      // server-side) — it's dead, so drop it instead of leaving a link to a
      // permanently blank chat in the list.
      if ((data.messages ?? []).length === 0) {
        const next = loadThreads().filter((t) => t.id !== id);
        localStorage.setItem(THREADS_KEY, JSON.stringify(next));
        setThreads(next);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingThread(false);
    }
  }

  function startNewChat() {
    const id = crypto.randomUUID();
    localStorage.setItem(CURRENT_KEY, id);
    setThreadId(id);
    setMessages([]);
    setError(null);
    setAttached(null);
    setHistoryOpen(false);
  }

  function switchThread(id: string) {
    localStorage.setItem(CURRENT_KEY, id);
    setThreadId(id);
    setHistoryOpen(false);
    loadThread(id);
  }

  async function send(text: string) {
    const trimmed = text.trim().slice(0, MAX_LEN);
    if (!trimmed || loading) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setLoading(true);
    localStorage.setItem(CURRENT_KEY, threadId);
    if (messages.length === 0) {
      saveThread(threadId, trimmed);
      setThreads(loadThreads());
    }
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: trimmed, scopeMeetingId: attached?.id }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429) {
        setError("already_processing");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.message) {
        setError(body.error || "ask_failed");
        return;
      }
      const message = body.message as Message;
      setMessages((prev) => [
        ...prev,
        { id: message.id, role: "assistant", content: message.content, citations: message.citations, blocks: message.blocks, guardBlocked: message.guardBlocked },
      ]);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      setError(timedOut ? "timeout" : "ask_failed");
    } finally {
      setLoading(false);
    }
  }

  const isEmpty = messages.length === 0 && !loadingThread;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between px-4 py-4 md:px-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ask</h1>
          <p className="text-sm text-muted-foreground">Ask anything across every meeting you&apos;ve had.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={historyRef}>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen((o) => !o)}>
              <History className="h-3.5 w-3.5" /> History
            </Button>
            {historyOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-10 w-72 overflow-hidden rounded-2xl border border-border bg-white p-2 shadow-[0_20px_48px_-12px_rgba(30,20,50,0.35)]">
                {threads.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">No previous chats yet.</p>
                ) : (
                  threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => switchThread(t.id)}
                      className={cn(
                        "block w-full truncate rounded-xl px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted",
                        t.id === threadId && "bg-accent-soft text-accent",
                      )}
                    >
                      {t.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button size="sm" onClick={startNewChat}>
            <Plus className="h-3.5 w-3.5" /> New chat
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 md:px-8">
        <div className="flex-1 overflow-y-auto py-2">
          {loadingThread ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 pb-10 text-center">
              <Orb size={104} />
              <div>
                <p className="text-lg font-semibold">Ask about any meeting</p>
                <p className="mt-1 text-sm text-muted-foreground">Attach a specific call, or ask across everything.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="surface rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground transition-transform hover:scale-105 hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-2">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[88%]"}>
                  <div
                    className={cn(
                      "text-sm",
                      m.role === "user"
                        ? "brand-gradient rounded-3xl px-6 py-3.5 text-accent-foreground"
                        : "surface rounded-3xl px-8 py-7",
                    )}
                  >
                    {m.guardBlocked && (
                      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--warning)]">
                        <ShieldAlert className="h-3 w-3" /> Out of scope for Ask
                      </span>
                    )}
                    {m.role === "assistant" ? (
                      <div className="prose-ask">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                    {m.blocks && <AskBlocks blocks={m.blocks} />}
                  </div>
                  {m.citations && m.citations.length > 0 && <CitationStrip citations={m.citations} />}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              )}
              {error && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  {error === "ai_not_configured" && "Ask needs GEMINI_API_KEY set."}
                  {error === "already_processing" && "Still working on your last question — wait for it to finish."}
                  {error === "timeout" && "That took too long — try a shorter or more specific question."}
                  {error === "ask_failed" && "Something went wrong — try again."}
                </p>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 pb-5 pt-2">
          {attached && (
            <div className="mb-2 flex w-fit items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
              <Video className="h-3.5 w-3.5" />
              {attached.title}
              <button onClick={() => setAttached(null)} className="text-accent/70 hover:text-accent">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="surface rounded-3xl p-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={loading}
              placeholder={loading ? "Waiting for a reply…" : attached ? `Ask about "${attached.title}"…` : "Ask anything about your meetings…"}
              rows={1}
              className="max-h-40 min-h-[24px] w-full resize-none border-none bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="relative" ref={attachRef}>
                <button
                  onClick={() => setAttachOpen((o) => !o)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Attach a meeting"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {attachOpen && (
                  <div className="absolute bottom-[calc(100%+10px)] left-0 z-10 max-h-72 w-72 overflow-y-auto rounded-2xl border border-border bg-white p-2 shadow-[0_20px_48px_-12px_rgba(30,20,50,0.35)]">
                    {meetings.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">No meetings yet.</p>
                    ) : (
                      meetings.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setAttached(m);
                            setAttachOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted"
                        >
                          <Video className="h-3.5 w-3.5 shrink-0 text-accent" />
                          <span className="truncate">{m.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sources for an answer, under the bubble in one horizontally scrolling row.
 * Arrow buttons appear only on the side(s) there's actually more to scroll.
 */
function CitationStrip({ citations }: { citations: Citation[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    update();
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [citations]);

  const scrollBy = (dir: 1 | -1) => rowRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  return (
    <div className="relative mt-2.5">
      {canLeft && (
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Scroll sources left"
          className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-on-surface shadow-md hover:bg-surface-container-low"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={rowRef}
        onScroll={update}
        className={cn("flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", canLeft && "pl-9", canRight && "pr-9")}
      >
        {citations.map((c, i) => (
          <Link
            key={i}
            href={`/m/${c.meetingId}`}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-container-lowest/90 px-3.5 py-1.5 text-label-sm text-on-surface-variant shadow-sm transition-colors hover:bg-primary-fixed hover:text-on-primary-fixed"
          >
            <Video className="h-3.5 w-3.5 text-primary" />
            {c.meetingTitle}
            <span className="tabular-nums text-on-surface-variant/70">· {formatTimecode(c.startMs / 1000)}</span>
          </Link>
        ))}
      </div>
      {canRight && (
        <button
          onClick={() => scrollBy(1)}
          aria-label="Scroll sources right"
          className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-on-surface shadow-md hover:bg-surface-container-low"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
