import Link from "next/link";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { getViewingWorkspaceId } from "@/server/session";
import { Avatar } from "@/components/ui/avatar";
import { formatDuration, cn } from "@/lib/utils";
import { Mic, CloudUpload, Video, Link2, MicOff, FileText, PenLine, ArrowRight, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}

export default async function CallsPage() {
  const workspaceId = await getViewingWorkspaceId();
  const [meetings, workspace] = await Promise.all([
    db.query.meetings.findMany({
      where: eq(schema.meetings.workspaceId, workspaceId),
      orderBy: [desc(schema.meetings.startedAt)],
      with: { participants: true, actionItems: true, summaries: true },
    }),
    db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) }),
  ]);

  const firstName = (workspace?.ownerName ?? "there").split(" ")[0];
  const recentDigests = meetings.slice(0, 2);

  return (
    <div className="relative w-full">
      <div className="mx-auto w-full max-w-7xl p-6 md:p-9">
        <div className="relative w-full">

          <div className="mb-9 flex flex-col gap-6">
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-4 py-1 text-label-sm text-on-surface-variant shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Aura Cognitive Companion
              </span>
              <h1 className="text-display-hero leading-tight tracking-tight text-on-surface">{greeting(firstName)}</h1>
            </div>
          </div>

          {/* Feature tiles — the yellow one is the primary action, sized up
              just slightly (3:2, not 2:1), each with its own decorative
              motif rather than the same shape repeated three times. */}
          <div className="mb-9 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#FFF8E7] to-[#FFF1CC] p-9 shadow-sm transition-all duration-300 hover:shadow-md lg:col-span-3">
              <Starburst className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 text-white/50" />
              <div className="relative flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 text-on-secondary-fixed shadow-sm backdrop-blur-md">
                  <Mic className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-[#FFE7A8] px-3 py-0.5 text-label-sm text-on-secondary-fixed">Instant mic</span>
              </div>
              <div className="relative my-4">
                <h2 className="text-headline-lg mb-1.5 text-on-secondary-fixed">Capture a meeting</h2>
                <p className="text-body-md leading-relaxed text-on-secondary-fixed-variant">Live AI voice call, recorded &amp; transcribed</p>
              </div>
              <Link
                href="/room"
                className="relative inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FFD646] px-5 py-2.5 text-label-md text-on-secondary-fixed shadow-sm transition-all hover:bg-[#ffcf29]"
              >
                Start recording
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-2">
              <div className="relative flex min-h-[128px] flex-1 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#F5EDFF] to-[#EBDDFF] p-6 shadow-sm transition-all duration-300 hover:shadow-md">
                <Blob className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 text-white/45" />
                <div className="relative flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-primary shadow-sm">
                    <CloudUpload className="h-[18px] w-[18px]" />
                  </div>
                  <Link
                    href="/ask"
                    className="relative inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-label-sm text-on-surface shadow-sm transition-all hover:bg-surface-container"
                  >
                    Open Ask
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="relative">
                  <h2 className="text-headline-sm text-on-tertiary-fixed">Ask your calls</h2>
                  <p className="text-body-sm text-on-tertiary-fixed-variant">Chat across everything discussed</p>
                </div>
              </div>

              <div className="relative flex min-h-[128px] flex-1 flex-col justify-between overflow-hidden rounded-3xl bg-[#1C1924] p-6 shadow-md transition-all duration-300 hover:shadow-xl">
                <OrbitRings className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 text-white/15" />
                <div className="relative flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white shadow-sm">
                    <Video className="h-[18px] w-[18px]" />
                  </div>
                  <Link
                    href="/search"
                    className="relative inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-label-sm text-[#1C1924] shadow-sm transition-all hover:bg-[#F3EEFA]"
                  >
                    Search
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="relative">
                  <h2 className="text-headline-sm text-white">Semantic search</h2>
                  <p className="text-body-sm text-[#CAC4D3]">Find any moment, by meaning</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-12">
            <div id="recent-meetings" className="flex flex-col gap-4 scroll-mt-24 lg:col-span-7">
              <h2 className="text-headline-md px-1 text-on-surface">Recent meetings</h2>

              {meetings.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="flex flex-col gap-3">
                  {meetings.map((m, i) => (
                    <MeetingRow key={m.id} meeting={m} tone={ROW_TONES[i % ROW_TONES.length]} />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 lg:col-span-5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-headline-md text-on-surface">Recent Intelligence</h2>
                {meetings.length > 2 && (
                  <a href="#recent-meetings" className="text-label-sm text-primary hover:underline">
                    View all ({meetings.length})
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {recentDigests.length === 0 ? (
                  <p className="rounded-3xl bg-surface-container-lowest/80 p-6 text-body-md text-on-surface-variant shadow-sm backdrop-blur-md">
                    No meetings yet — the first one you capture shows up here.
                  </p>
                ) : (
                  recentDigests.map((m) => {
                    const summary = m.summaries.find((s) => s.template === "general") ?? m.summaries[0];
                    const openCount = m.actionItems.filter((a) => !a.done).length;
                    return (
                      <div key={m.id} className="flex flex-col gap-4 rounded-3xl bg-surface-container-lowest/80 p-6 shadow-sm backdrop-blur-md transition-all hover:shadow-md">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.participants[0]?.name ?? m.title} size={36} />
                            <div>
                              <h3 className="text-headline-sm leading-tight text-on-surface">{m.title}</h3>
                              <span className="text-body-sm text-on-surface-variant">
                                {new Date(m.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(m.durationSec)}
                              </span>
                            </div>
                          </div>
                          {openCount > 0 ? (
                            <span className="rounded-full bg-[#F4EEFF] px-2.5 py-0.5 text-label-sm text-primary">{openCount} action items</span>
                          ) : m.status === "ready" ? (
                            <span className="rounded-full bg-[#FFF8E7] px-2.5 py-0.5 text-label-sm text-on-secondary-fixed">Summarized</span>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-body-md leading-relaxed text-on-surface-variant">
                          {summary?.content?.purpose || "Summary generates automatically once the transcript is processed."}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex -space-x-2">
                            {m.participants.slice(0, 3).map((p) => (
                              <Avatar key={p.id} name={p.name} size={24} className="ring-2 ring-surface-container-lowest" />
                            ))}
                          </div>
                          <Link href={`/m/${m.id}`} className="inline-flex items-center gap-1 text-label-sm text-primary hover:text-on-primary-fixed-variant">
                            View Brief
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ROW_TONES = [
  { bg: "#F4EEFF", icon: Link2, iconColor: "text-primary" },
  { bg: "#FFF8E7", icon: MicOff, iconColor: "text-on-secondary-fixed" },
  { bg: "#EBFBF5", icon: FileText, iconColor: "text-[#10B981]" },
  { bg: "#FFF0F6", icon: PenLine, iconColor: "text-[#EC4899]" },
] as const;

/** A soft four-point sparkle shape — the "fun" decorative motif on the tiles, drawn as an SVG rather than an image asset. */
function Starburst({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor">
      <path d="M50 0 C52 30 70 48 100 50 C70 52 52 70 50 100 C48 70 30 52 0 50 C30 48 48 30 50 0 Z" />
    </svg>
  );
}

/** A soft cloud-like blob — the Ask tile's motif. */
function Blob({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor">
      <path d="M30 75 C10 75 0 60 5 45 C-2 30 12 15 30 18 C38 5 62 5 70 18 C90 15 100 35 92 50 C100 65 88 80 70 78 C60 90 40 90 30 75 Z" />
    </svg>
  );
}

/** Concentric orbit rings — the Search tile's motif. */
function OrbitRings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6">
      <circle cx="50" cy="50" r="46" />
      <circle cx="50" cy="50" r="28" />
      <circle cx="50" cy="50" r="8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface-container-lowest/80 px-6 py-16 text-center shadow-sm backdrop-blur-md">
      <p className="text-headline-sm text-on-surface">No meetings yet</p>
      <p className="text-body-md text-on-surface-variant">Start a test meeting to see a real transcript, summary, and clips.</p>
      <Link href="/room" className="brand-gradient rounded-full px-5 py-2.5 text-label-lg text-white shadow-[0_8px_20px_-4px_rgba(168,85,247,0.35)]">
        Start your first meeting
      </Link>
    </div>
  );
}

function MeetingRow({
  meeting,
  tone,
}: {
  meeting: typeof schema.meetings.$inferSelect & {
    participants: (typeof schema.participants.$inferSelect)[];
    actionItems: (typeof schema.actionItems.$inferSelect)[];
  };
  tone: (typeof ROW_TONES)[number];
}) {
  const openCount = meeting.actionItems.filter((a) => !a.done).length;
  const Icon = tone.icon;
  return (
    <Link
      href={`/m/${meeting.id}`}
      className="group flex items-center justify-between rounded-2xl p-4 shadow-sm transition-all"
      style={{ background: tone.bg }}
    >
      <div className="flex items-center gap-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xs", tone.iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-headline-sm text-on-surface">{meeting.title}</span>
          <span className="text-body-sm text-on-surface-variant">
            {new Date(meeting.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(meeting.durationSec)}
            {meeting.hadExternal && " · External"}
            {openCount > 0 && ` · ${openCount} open`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {meeting.participants.length > 0 && (
          <div className="hidden -space-x-2 sm:flex">
            {meeting.participants.slice(0, 3).map((p) => (
              <Avatar key={p.id} name={p.name} size={24} className="ring-2 ring-white" />
            ))}
          </div>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-on-surface shadow-xs transition-transform group-hover:scale-105">
          {openCount > 0 ? <CheckCircle2 className="h-[18px] w-[18px] text-primary" /> : <ArrowRight className="h-[18px] w-[18px]" />}
        </div>
      </div>
    </Link>
  );
}
