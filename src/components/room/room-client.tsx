"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  ShieldAlert,
  UserPlus,
  Loader2,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatTimecode } from "@/lib/utils";
import { useLiveAgent } from "@/hooks/use-live-agent";
import { RoomRecorder } from "@/lib/room-recorder";
import { extractWakeWordQuestion } from "./wake-word";
import { RoomLobby } from "./room-lobby";
import { TranscriptPanel } from "./transcript-panel";
import type { RoomParticipant, RoomPrefs, TranscriptLine } from "./types";

const AGENT_NAME = "Priya";
const GUEST_PRESETS = [
  { name: "Alex Reyes (client)", email: "alex@acme-client.com" },
  { name: "Jordan Lee (prospect)", email: "jordan@outsidecorp.io" },
];

type Stage = "lobby" | "live" | "ending";

export function RoomClient({ prefs }: { prefs: RoomPrefs }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("lobby");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [asking, setAsking] = useState(false);
  const [showConsent, setShowConsent] = useState(prefs.announceConsent);
  const [notetakerNote, setNotetakerNote] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef(new RoomRecorder());
  const callStartRef = useRef<number>(0);
  const turnBufferRef = useRef<{ you: { text: string; startMs: number } | null; agent: { text: string; startMs: number } | null }>({
    you: null,
    agent: null,
  });

  const persistSegment = useCallback(
    (mid: string, speaker: string, text: string, startMs: number, endMs: number) => {
      if (!text.trim()) return;
      fetch(`/api/meetings/${mid}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker, startMs, endMs, text, isFinal: true }),
      }).catch(() => {});
    },
    [],
  );

  const askingRef = useRef(false);

  const askNotetaker = useCallback(
    async (mid: string, question: string) => {
      // Guards against the wake-word detector firing again (e.g. the agent's
      // own TTS or a second utterance) while a previous question is still
      // being answered — one in flight at a time.
      if (askingRef.current) return;
      askingRef.current = true;
      setAsking(true);
      setNotetakerNote(null);
      try {
        const res = await fetch(`/api/meetings/${mid}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, atMs: Date.now() - callStartRef.current }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error("ask_failed");
        const data = (await res.json()) as { answer: string; blocked: boolean };
        const startMs = Date.now() - callStartRef.current;
        setLines((prev) => [
          ...prev,
          { id: crypto.randomUUID(), speaker: prefs.notetakerName, text: data.answer, startMs, endMs: startMs, final: true },
        ]);
        persistSegment(mid, prefs.notetakerName, data.answer, startMs, startMs);
        if (data.blocked) {
          setNotetakerNote("Declined to answer — a guest is on this call.");
        }
        if ("speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(data.answer);
          utter.rate = 1.02;
          window.speechSynthesis.speak(utter);
        }
      } catch {
        toast.error("The notetaker couldn't answer that — check the Gemini API key is configured.");
      } finally {
        askingRef.current = false;
        setAsking(false);
      }
    },
    [persistSegment, prefs.notetakerName],
  );

  const meetingIdRef = useRef<string | null>(null);
  meetingIdRef.current = meetingId;

  const { status: agentStatus, start: startAgent, stop: stopAgent, setMuted: setAgentMuted, getAgentAudioStream, getMicStream } =
    useLiveAgent({
      onSpeakingChange: setAgentSpeaking,
      onTranscript: (e) => {
        const mid = meetingIdRef.current;
        const bufKey = e.speaker === "You" ? "you" : "agent";
        const buf = turnBufferRef.current;
        const now = Date.now() - callStartRef.current;

        if (!buf[bufKey]) buf[bufKey] = { text: "", startMs: now };
        buf[bufKey]!.text += e.text;

        setLines((prev) => {
          const id = `${bufKey}-live`;
          const existingIdx = prev.findIndex((l) => l.id === id);
          const line: TranscriptLine = {
            id,
            speaker: e.speaker === "You" ? prefs.ownerName : AGENT_NAME,
            text: buf[bufKey]!.text,
            startMs: buf[bufKey]!.startMs,
            endMs: now,
            final: false,
          };
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = line;
            return next;
          }
          return [...prev, line];
        });

        if (e.final) {
          const finalText = buf[bufKey]!.text.trim();
          const startMs = buf[bufKey]!.startMs;
          buf[bufKey] = null;

          setLines((prev) =>
            prev.map((l) => (l.id === `${bufKey}-live` ? { ...l, id: crypto.randomUUID(), final: true } : l)),
          );

          if (mid) persistSegment(mid, e.speaker === "You" ? prefs.ownerName : AGENT_NAME, finalText, startMs, now);

          if (e.speaker === "You" && mid) {
            const question = extractWakeWordQuestion(finalText, prefs.notetakerName);
            if (question) void askNotetaker(mid, question);
          }
        }
      },
    });

  useEffect(() => {
    if (stage !== "live") return;
    const t = setInterval(() => setElapsedMs(Date.now() - callStartRef.current), 500);
    return () => clearInterval(t);
  }, [stage]);

  const handleJoin = useCallback(
    async (stream: MediaStream) => {
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Test meeting — ${new Date().toLocaleString()}` }),
      });
      if (!res.ok) {
        toast.error("Couldn't start the meeting — check the database is configured.");
        return;
      }
      const { meeting } = (await res.json()) as { meeting: { id: string } };
      setMeetingId(meeting.id);
      meetingIdRef.current = meeting.id;
      callStartRef.current = Date.now();

      const partsRes = await fetch(`/api/meetings/${meeting.id}/participants`);
      const { participants: existing } = (await partsRes.json()) as { participants: RoomParticipant[] };
      setParticipants(existing);

      try {
        await startAgent();
      } catch {
        toast.error("Live agent failed to connect — check GEMINI_API_KEY. The call continues without it.");
      }

      recorderRef.current.start(stream, getMicStream() ?? stream, getAgentAudioStream());
      setStage("live");
    },
    [startAgent, getMicStream, getAgentAudioStream],
  );

  const handleAddGuest = useCallback(
    async (preset: (typeof GUEST_PRESETS)[number]) => {
      const mid = meetingIdRef.current;
      if (!mid) return;
      const res = await fetch(`/api/meetings/${mid}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: preset.name, email: preset.email, role: "guest" }),
      });
      const { participant } = (await res.json()) as { participant: RoomParticipant };
      setParticipants((prev) => [...prev, participant]);
      toast.info(`${preset.name} joined — the notetaker will now guard internal info from them.`);
    },
    [],
  );

  const handleHighlight = useCallback(async () => {
    const mid = meetingIdRef.current;
    if (!mid) return;
    const at = Date.now() - callStartRef.current;
    await fetch(`/api/meetings/${mid}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMs: Math.max(0, at - 5000), endMs: at, createdDuringCall: true }),
    });
    toast.success("Highlighted this moment");
  }, []);

  const handleEnd = useCallback(async () => {
    const mid = meetingIdRef.current;
    if (!mid) return;
    setStage("ending");
    stopAgent();

    const blob = await recorderRef.current.stop();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());

    if (blob) {
      await fetch(`/api/meetings/${mid}/recording`, { method: "POST", body: blob, headers: { "Content-Type": blob.type } }).catch(
        () => {},
      );
    }

    await fetch(`/api/meetings/${mid}/end`, { method: "POST" }).catch(() => {});
    router.push(`/m/${mid}`);
  }, [router, stopAgent]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      setAgentMuted(next);
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, [setAgentMuted]);

  if (stage === "lobby") return <RoomLobby prefs={prefs} onJoin={handleJoin} />;

  return (
    <div className="flex h-screen flex-col bg-background">
      {showConsent && (
        <div className="flex items-center justify-between gap-3 bg-accent-soft px-4 py-2 text-xs text-accent">
          <span className="flex items-center gap-2">
            <Circle className="h-2 w-2 animate-record fill-current" />
            This meeting is being recorded and transcribed. Everyone on this call has been notified.
          </span>
          <button onClick={() => setShowConsent(false)} className="font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col p-4">
          <div className="grid flex-1 grid-cols-2 gap-3">
            <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                {prefs.ownerName} {muted && "(muted)"}
              </span>
            </div>
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[var(--radius-lg)] bg-card transition-shadow",
                agentSpeaking && "ring-2 ring-accent",
              )}
            >
              <Avatar name={AGENT_NAME} size={72} />
              <span className="text-sm font-medium">{AGENT_NAME}</span>
              <span className="text-xs text-muted-foreground">
                {agentStatus === "connecting" && "Connecting…"}
                {agentStatus === "live" && (agentSpeaking ? "Speaking…" : "Listening")}
                {agentStatus === "reconnecting" && "Reconnecting…"}
                {agentStatus === "error" && "Unavailable"}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-sm">
              <Circle className="h-2.5 w-2.5 animate-record fill-[hsl(var(--destructive))] text-[hsl(var(--destructive))]" />
              <span className="font-mono tabular-nums">{formatTimecode(elapsedMs / 1000)}</span>
              <div className="ml-2 flex -space-x-2">
                {participants.map((p) => (
                  <Avatar key={p.id} name={p.name} size={24} className="ring-2 ring-card" />
                ))}
              </div>
              {participants.some((p) => p.isExternal) && (
                <span className="ml-1 flex items-center gap-1 text-xs text-[hsl(var(--warning))]">
                  <ShieldAlert className="h-3.5 w-3.5" /> Guest present — recall guarded
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant={muted ? "destructive" : "secondary"} size="icon" onClick={toggleMute} title="Mute">
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleHighlight}>
                <Sparkles className="h-4 w-4" /> Highlight
              </Button>
              <GuestMenu onAdd={handleAddGuest} />
              <Button variant="destructive" size="sm" onClick={handleEnd} disabled={stage === "ending"}>
                {stage === "ending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                End
              </Button>
            </div>
          </div>

          {(asking || notetakerNote) && (
            <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] bg-accent-soft px-3 py-2 text-xs text-accent">
              {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {asking ? `${prefs.notetakerName} is looking that up…` : notetakerNote}
            </div>
          )}
        </div>

        <div className="w-80 shrink-0 border-l border-border">
          <TranscriptPanel lines={lines} notetakerName={prefs.notetakerName} />
        </div>
      </div>
    </div>
  );
}

function GuestMenu({ onAdd }: { onAdd: (p: (typeof GUEST_PRESETS)[number]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <UserPlus className="h-4 w-4" /> Add guest
      </Button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-56 rounded-[var(--radius-md)] border border-border bg-card p-1 shadow-lg">
          {GUEST_PRESETS.map((g) => (
            <button
              key={g.email}
              onClick={() => {
                onAdd(g);
                setOpen(false);
              }}
              className="block w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-xs hover:bg-muted"
            >
              {g.name}
            </button>
          ))}
          <p className="px-2.5 pt-1 pb-0.5 text-[10px] text-muted-foreground">Simulates someone external joining, to test the guardrail.</p>
        </div>
      )}
    </div>
  );
}
