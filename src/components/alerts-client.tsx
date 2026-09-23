"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatTimecode } from "@/lib/utils";
import type { Alert, AlertHit } from "@/lib/db/schema";

export function AlertsClient() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hits, setHits] = useState<AlertHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    const res = await fetch("/api/alerts");
    const data = (await res.json()) as { alerts: Alert[]; hits: AlertHit[] };
    setAlerts(data.alerts);
    setHits(data.hits);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim() || !query.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query, keywords: [] }),
      });
      setName("");
      setQuery("");
      toast.success("Alert created — it'll match against every meeting from now on.");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
  }

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 text-body-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-2 rounded-3xl bg-surface-container-lowest/80 p-4 shadow-sm backdrop-blur-md sm:flex-row">
        <Input placeholder="Alert name (e.g. Churn risk)" value={name} onChange={(e) => setName(e.target.value)} className="sm:w-56" />
        <Input placeholder="What to watch for (e.g. customer mentions cancelling)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button onClick={create} disabled={creating || !name.trim() || !query.trim()}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </Button>
      </div>

      {alerts.length === 0 ? (
        <p className="text-center text-body-sm text-on-surface-variant">No alerts yet — create one above.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => {
            const alertHits = hits.filter((h) => h.alertId === alert.id);
            return (
              <div key={alert.id} className="rounded-3xl bg-surface-container-lowest/80 p-5 shadow-sm backdrop-blur-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-primary" />
                      <span className="text-label-lg font-medium text-on-surface">{alert.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-label-sm",
                          alertHits.length > 0 ? "bg-[#F4EEFF] text-primary" : "bg-surface-container-low text-on-surface-variant",
                        )}
                      >
                        {alertHits.length} hit{alertHits.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-1 text-body-sm text-on-surface-variant">&ldquo;{alert.query}&rdquo;</p>
                  </div>
                  <button onClick={() => remove(alert.id)} className="text-on-surface-variant transition-colors hover:text-[var(--destructive)]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {alertHits.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 border-t border-outline-variant/40 pt-3">
                    {alertHits.slice(0, 5).map((h) => (
                      <Link
                        key={h.id}
                        href={`/m/${h.meetingId}`}
                        className="rounded-xl px-2.5 py-1.5 text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                      >
                        {formatTimecode(h.startMs / 1000)} — {h.snippet.slice(0, 100)}…
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
