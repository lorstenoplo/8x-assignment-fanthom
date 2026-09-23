"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, Loader2, AlertTriangle, X, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatTimecode, formatDuration, cn } from "@/lib/utils";
import type { SearchResult } from "@/app/api/search/route";

const RECENT_KEY = "aura_recent_searches";
const MAX_RECENT = 6;
/** Fires only once the query has enough content to be worth a real embedding
 * call — three words or a longer single token — cutting API calls on every
 * keystroke down to roughly one per completed thought. */
const MIN_WORDS = 3;
const MIN_CHARS = 12;
const DEBOUNCE_MS = 500;

const SUGGESTIONS = ["What did we decide about pricing?", "Summarize what's blocked across my last few calls", "Who owns the open action items?"];

const CARD_TONES = [
  "from-[#F5EDFF] to-[#EBDDFF]",
  "from-[#FFF8E7] to-[#FFF1CC]",
  "from-[#EBFBF5] to-[#D9F7EC]",
  "from-[#FFF0F6] to-[#FFE2ED]",
] as const;

function isSearchable(q: string) {
  const trimmed = q.trim();
  if (trimmed.length >= MIN_CHARS) return true;
  return trimmed.split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    const next = [query, ...loadRecent().filter((q) => q !== query)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

type Filter = "all" | "action_items" | "external";

export function SearchClient({ initialQuery = "" }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Deliberately an effect, not a lazy useState initializer: the server
  // render has no localStorage, so reading it during render would mismatch
  // the client's hydration pass. Loading it a tick later avoids that.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecent(loadRecent()), []);
  // A query arriving via ?q= (Enter from the header search) is already a
  // deliberate submission — run it immediately instead of waiting for the
  // debounce/word-count gate that guards keystroke-by-keystroke typing.
  useEffect(() => {
    if (initialQuery.trim()) void run(initialQuery);
  }, [initialQuery]);

  async function run(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "search_failed");
        setResults([]);
        return;
      }
      const data = (await res.json()) as { results: SearchResult[] };
      setResults(data.results);
      setRecent(saveRecent(trimmed));
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("search_failed");
    } finally {
      setLoading(false);
    }
  }

  function onChange(v: string) {
    setQ(v);
    clearTimeout(debounceRef.current);
    if (!isSearchable(v)) {
      setResults(null);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => run(v), DEBOUNCE_MS);
  }

  function runQuery(query: string) {
    setQ(query);
    clearTimeout(debounceRef.current);
    void run(query);
  }

  const showHint = q.trim().length > 0 && !isSearchable(q) && !loading;

  const filtered = (results ?? []).filter((r) => {
    if (filter === "action_items") return r.openActionItems > 0;
    if (filter === "external") return r.hadExternal;
    return true;
  });

  return (
    <div className="relative w-full">
      <div className="mx-auto w-full max-w-4xl p-6 md:p-9">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-4 py-1 text-label-sm text-on-surface-variant shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Semantic Neural Search
          </span>
          <h1 className="text-display-hero leading-tight tracking-tight text-on-surface">What would you like to recall?</h1>
          <p className="max-w-lg text-body-md text-on-surface-variant">
            Search transcribed dialogue, decisions, and action commitments across every meeting.
          </p>
        </div>

        <div className="relative mx-auto max-w-2xl">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            autoFocus
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runQuery(q)}
            placeholder="e.g. what did we decide about pricing?"
            className="h-12 w-full rounded-full bg-surface-container-lowest/90 pl-11 pr-10 text-body-sm text-on-surface shadow-sm outline-none placeholder:text-on-surface-variant/70"
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-on-surface-variant" />}
          {!loading && q && (
            <button
              onClick={() => {
                setQ("");
                setResults(null);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showHint && <p className="mt-2 text-center text-label-sm text-on-surface-variant">Keep typing — a few more words gives a much better match.</p>}

        {!results && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => runQuery(s)}
                className="rounded-full bg-surface-container-lowest/80 px-4 py-2 text-label-md text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {results && results.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
            <FilterChip label="All Meetings" active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label="With Action Items" active={filter === "action_items"} onClick={() => setFilter("action_items")} />
            <FilterChip label="External" active={filter === "external"} onClick={() => setFilter("external")} />
          </div>
        )}

        {!q && recent.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-label-sm text-on-surface-variant">Recent:</span>
            {recent.map((r) => (
              <button
                key={r}
                onClick={() => runQuery(r)}
                className="rounded-full bg-surface-container-low px-3 py-1 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {error === "ai_not_configured" && (
          <p className="mt-6 flex items-center justify-center gap-2 text-body-sm text-on-surface-variant">
            <AlertTriangle className="h-4 w-4" /> Search needs GEMINI_API_KEY set.
          </p>
        )}
        {error && error !== "ai_not_configured" && (
          <p className="mt-6 flex items-center justify-center gap-2 text-body-sm text-on-surface-variant">
            <AlertTriangle className="h-4 w-4" /> Couldn&apos;t run that search — try again.
          </p>
        )}

        {results && (
          <div className="mt-9">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-headline-sm text-on-surface">
                {filtered.length} Matching Session{filtered.length === 1 ? "" : "s"}
              </h2>
              <span className="text-label-sm text-on-surface-variant">Sorted by relevance</span>
            </div>

            {filtered.length === 0 && !loading && (
              <p className="rounded-3xl bg-surface-container-lowest/80 p-6 text-center text-body-md text-on-surface-variant shadow-sm">
                No matching moments found.
              </p>
            )}

            <div className="flex flex-col gap-4">
              {filtered.map((r, i) => (
                <ResultCard key={r.meetingId} result={r} tone={CARD_TONES[i % CARD_TONES.length]} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-label-md transition-colors",
        active ? "bg-obsidian text-on-obsidian" : "bg-surface-container-lowest/80 text-on-surface-variant shadow-sm hover:bg-surface-container-low",
      )}
    >
      {label}
    </button>
  );
}

function ResultCard({ result, tone }: { result: SearchResult; tone: string }) {
  return (
    <Link
      href={`/m/${result.meetingId}`}
      className="group flex flex-col gap-3 rounded-3xl bg-surface-container-lowest/80 p-5 shadow-sm backdrop-blur-md transition-all hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full bg-gradient-to-br px-2.5 py-0.5 text-label-sm text-on-surface", tone)}>
            {result.source === "seed" ? "Seed meeting" : "Test meeting"}
          </span>
          <span className="text-label-sm text-on-surface-variant">
            {new Date(result.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(result.durationSec)}
          </span>
          {result.hadExternal && (
            <span className="flex items-center gap-1 text-label-sm text-on-surface-variant">
              <ShieldAlert className="h-3 w-3" /> External
            </span>
          )}
          {result.openActionItems > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#F4EEFF] px-2 py-0.5 text-label-sm text-primary">
              <CheckCircle2 className="h-3 w-3" /> {result.openActionItems} open
            </span>
          )}
        </div>
        <h3 className="text-headline-sm text-on-surface">{result.meetingTitle}</h3>
        <p className="mt-1 line-clamp-2 text-body-sm italic text-on-surface-variant">
          &ldquo;{result.quote}&rdquo; · {formatTimecode(result.startMs / 1000)}
        </p>
        {result.participantNames.length > 0 && (
          <div className="mt-2 flex -space-x-2">
            {result.participantNames.slice(0, 4).map((name) => (
              <Avatar key={name} name={name} size={22} className="ring-2 ring-surface-container-lowest" />
            ))}
          </div>
        )}
      </div>
      <span className="brand-gradient inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-label-md text-white shadow-sm transition-transform group-hover:scale-105">
        Open Brief &amp; Transcript
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
