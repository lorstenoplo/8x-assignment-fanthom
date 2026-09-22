"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTimecode } from "@/lib/utils";
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
      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row">
          <Input placeholder="Alert name (e.g. Churn risk)" value={name} onChange={(e) => setName(e.target.value)} className="sm:w-56" />
          <Input placeholder="What to watch for (e.g. customer mentions cancelling)" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button onClick={create} disabled={creating || !name.trim() || !query.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </Button>
        </CardContent>
      </Card>

      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alerts yet — create one above.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => {
            const alertHits = hits.filter((h) => h.alertId === alert.id);
            return (
              <Card key={alert.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-accent" />
                        <span className="text-sm font-medium">{alert.name}</span>
                        <Badge variant={alertHits.length > 0 ? "default" : "muted"}>{alertHits.length} hit{alertHits.length === 1 ? "" : "s"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">&ldquo;{alert.query}&rdquo;</p>
                    </div>
                    <button onClick={() => remove(alert.id)} className="text-muted-foreground hover:text-[hsl(var(--destructive))]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {alertHits.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                      {alertHits.slice(0, 5).map((h) => (
                        <Link
                          key={h.id}
                          href={`/m/${h.meetingId}`}
                          className="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                          {formatTimecode(h.startMs / 1000)} — {h.snippet.slice(0, 100)}…
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
