"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic, LayoutGrid, Search, Sparkles, Bell, Video, Beaker } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/calls", label: "My Calls", icon: LayoutGrid },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ask", label: "Ask", icon: Sparkles },
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

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
        <div className="flex h-14 items-center gap-2 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Mic className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Fathom Clone</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          <Link
            href="/room"
            className="mt-3 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Video className="h-4 w-4" />
            Start test meeting
          </Link>
        </nav>

        <div className="border-t border-border p-3">
          {workspace.isDemo && (
            <div className="mb-2 flex items-center gap-1.5 rounded-[var(--radius-md)] bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <Beaker className="h-3.5 w-3.5" />
              Viewing shared demo data
            </div>
          )}
          <div className="flex items-center gap-2 px-1 py-1 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {workspace.ownerName.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-muted-foreground">{workspace.ownerName}</span>
            {!workspace.isDemo && <Badge className="ml-auto">You</Badge>}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Mic className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">Fathom Clone</span>
          <Link href="/room" className="ml-auto rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
            Test call
          </Link>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium",
                pathname.startsWith(item.href) ? "bg-accent-soft text-accent" : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
