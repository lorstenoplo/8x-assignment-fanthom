"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { Alert, AlertHit } from "@/lib/db/schema";

/**
 * Real data, not decorative: fetches the workspace's alert hits and shows the
 * most recent 1-2 in a dropdown, with a link to the full Alerts page.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<(AlertHit & { alertName?: string })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      try {
        const res = await fetch("/api/alerts");
        const data = (await res.json()) as { alerts: Alert[]; hits: AlertHit[] };
        const nameById = new Map(data.alerts.map((a) => [a.id, a.name]));
        const sorted = [...data.hits]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 2)
          .map((h) => ({ ...h, alertName: nameById.get(h.alertId) }));
        setHits(sorted);
      } catch {
        // leave empty — the dropdown just shows "nothing yet"
      } finally {
        setLoaded(true);
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest/80 text-on-surface-variant shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all hover:bg-surface-container hover:text-on-surface"
      >
        <Bell className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-80 overflow-hidden rounded-2xl border border-outline-variant/30 bg-white shadow-[0_20px_48px_-12px_rgba(30,20,50,0.35)]">
          <div className="border-b border-outline-variant/30 px-5 py-3.5 text-center text-label-lg font-bold text-on-surface">Alerts</div>
          <div className="max-h-80 overflow-y-auto p-2">
            {!loaded ? (
              <p className="px-3 py-6 text-center text-body-sm text-on-surface-variant">Loading…</p>
            ) : hits.length === 0 ? (
              <p className="px-3 py-6 text-center text-body-sm text-on-surface-variant">
                Nothing yet — alerts fire when a watched topic comes up in a meeting.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {hits.map((h) => (
                  <Link
                    key={h.id}
                    href={`/m/${h.meetingId}`}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-container-low"
                  >
                    <p className="text-label-md font-medium text-on-surface">{h.alertName ?? "Alert"}</p>
                    <p className="mt-0.5 line-clamp-2 text-body-sm text-on-surface-variant">{h.snippet}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link
            href="/alerts"
            onClick={() => setOpen(false)}
            className="block border-t border-outline-variant/30 px-4 py-2.5 text-center text-label-sm font-medium text-primary hover:bg-surface-container-low"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
