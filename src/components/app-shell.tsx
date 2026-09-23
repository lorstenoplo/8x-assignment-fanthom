"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, Search, MessageCircle, Bell, Plus, User, ChevronsUpDown, CornerDownLeft } from "lucide-react";
import { Logomark } from "@/components/logomark";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/calls", label: "Overview", icon: LayoutGrid },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ask", label: "Ask", icon: MessageCircle },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export function AppShell({
  workspace,
  children,
}: {
  workspace: { id: string; ownerName: string; isDemo: boolean };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <>
      {/* Fixed, frosted-glass sidebar — no border, translucent over the flat
          background, elevated by blur alone. */}
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 flex-col justify-between bg-surface-container-lowest/35 p-6 backdrop-blur-xl md:flex">
        <div className="flex flex-col gap-9">
          <div className="flex items-center gap-3 px-1">
            <Logomark className="h-6 w-6 text-on-surface" />
            <span className="text-headline-md text-on-surface tracking-tight">Aura</span>
          </div>

          <nav className="flex flex-col gap-4">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-full px-4 py-2.5 text-label-lg transition-all duration-200",
                    active ? "bg-primary-fixed text-on-primary-fixed shadow-sm" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                  )}
                >
                  <item.icon className="h-5 w-5" strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center justify-between px-1 py-1">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <User className="h-[18px] w-[18px] text-on-primary" />
              </div>
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-primary-container ring-2 ring-surface-container-lowest" />
            </div>
            <div className="flex flex-col">
              <span className="text-label-md leading-tight text-on-surface">{workspace.ownerName}</span>
              <span className="text-label-sm leading-tight text-on-surface-variant">{workspace.isDemo ? "Shared demo data" : "Syncing notes"}</span>
            </div>
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
            <ChevronsUpDown className="h-[18px] w-[18px]" />
          </button>
        </div>
      </aside>

      <div className="md:pl-64">
        {/* Fixed, frosted header — floats above content, no border. */}
        <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between gap-3 bg-surface-bright/40 px-4 backdrop-blur-xl md:left-64 md:h-20 md:px-9">
          <Link href="/room" className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-white md:hidden">
            <Plus className="h-4 w-4" />
          </Link>
          <form
            className="flex max-w-md flex-1 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <div className="relative hidden w-full items-center md:flex">
              <Search className="pointer-events-none absolute left-4 h-5 w-5 text-on-surface-variant" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search transcripts, meetings, or insights…"
                className="w-full rounded-full bg-surface-container-lowest/80 py-2.5 pl-10 pr-16 text-body-sm text-on-surface shadow-[0_2px_12px_rgba(0,0,0,0.02)] outline-none transition-all duration-200 placeholder:text-on-surface-variant/70 focus:bg-surface-container-lowest"
              />
              {q.trim() && (
                <span className="pointer-events-none absolute right-4 flex items-center gap-1 text-label-sm text-on-surface-variant/70">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  Enter
                </span>
              )}
            </div>
          </form>
          <div className="flex items-center gap-3">
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest/80 text-on-surface-variant shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all hover:bg-surface-container hover:text-on-surface">
              <Bell className="h-5 w-5" />
            </button>
            <Link
              href="/room"
              className="brand-gradient flex items-center gap-1.5 rounded-full px-5 py-2.5 text-label-md text-white shadow-[0_8px_20px_-4px_rgba(168,85,247,0.35)] transition-all duration-200 hover:shadow-[0_10px_24px_-4px_rgba(168,85,247,0.45)] active:scale-[0.98]"
            >
              <Plus className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">New Meeting</span>
            </Link>
          </div>
        </header>

        <nav className="fixed inset-x-0 top-16 z-40 flex gap-2 overflow-x-auto bg-surface-bright/90 px-3 py-2 backdrop-blur-xl md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-label-md",
                pathname.startsWith(item.href) ? "bg-obsidian text-on-obsidian" : "bg-surface-container text-on-surface-variant",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="relative min-h-screen w-full pt-28 md:pt-20">{children}</main>
      </div>
    </>
  );
}
