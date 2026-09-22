"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimecode } from "@/lib/utils";

type Result = { id: string; meetingId: string; meetingTitle: string; text: string; startMs: number; score: number };

export function SearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(query: string) {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "search_failed");
        setResults([]);
        return;
      }
      const data = (await res.json()) as { results: Result[] };
      setResults(data.results);
    } finally {
      setLoading(false);
    }
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function onChange(v: string) {
    setQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(v), 350);
  }

  return (
    <div className="mt-6">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. what did we decide about pricing?"
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {error === "ai_not_configured" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Search needs GEMINI_API_KEY set.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {results?.length === 0 && !loading && <p className="text-sm text-muted-foreground">No matching moments found.</p>}
        {results?.map((r) => (
          <Link key={r.id} href={`/m/${r.meetingId}`}>
            <Card className="transition-colors hover:border-accent/50 hover:bg-muted/30">
              <CardContent className="p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.meetingTitle}</span>
                  <span>{formatTimecode(r.startMs / 1000)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{r.text}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
