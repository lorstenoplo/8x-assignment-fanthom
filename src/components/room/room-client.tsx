"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import {
  Mic,
  MicOff,
  PhoneOff,
  Bookmark,
  ShieldAlert,
  UserPlus,
  Loader2,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Logomark } from "@/components/logomark";
import { cn, formatTimecode } from "@/lib/utils";
import { useLiveAgent, type LiveTranscriptEvent } from "@/hooks/use-live-agent";
import { RoomRecorder } from "@/lib/room-recorder";
import { RoomCompositor } from "@/lib/room-compositor";
import { PcmPlayer } from "@/lib/audio-pcm";
import { NotetakerVoice } from "@/lib/notetaker-voice";
import { RoomLobby } from "./room-lobby";
import { TranscriptPanel } from "./transcript-panel";
import type { RoomParticipant, RoomPrefs, TranscriptLine } from "./types";

/** A few attempts with backoff for end-of-call requests, where the recording
 * and transcript already exist locally and a single transient network blip
 * shouldn't be allowed to strand them. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 4,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || i === attempts - 1) return res;
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i));
  }
  throw lastErr;
}

const AGENT_NAME = "Priya";
const ACK_PHRASES = [
  "Let me check that for you.",
  "One sec, looking through past meetings.",
  "Give me a moment to pull that up.",
];
const GUEST_PRESETS = [
  { name: "Alex Reyes (client)", email: "alex@acme-client.com" },
  { name: "Jordan Lee (prospect)", email: "jordan@outsidecorp.io" },
];

/** A gap this long between transcript fragments means one thought ended. */
const PAUSE_MS = 900;
/** How long after the last word following the wake phrase before the question counts as finished. */
const QUESTION_SILENCE_MS = 1300;
/** After just "Hey Aura" with nothing yet, how long to keep listening for the question to start. */
const QUESTION_START_WAIT_MS = 6000;
/** The guest-safe answer path may include retrieval plus two model checks. */
const IN_CALL_ASK_TIMEOUT_MS = 60_000;
/**
 * Input transcription arrives a little after the words were actually spoken,
 * so your lines are shifted back by roughly that much to line up with the
 * recording.
 */
const INPUT_TRANSCRIPTION_LAG_MS = 600;

/**
 * Gemini's transcription emits placeholder tokens for a wordless or silent
 * turn ("<no speech detected>", "<no speech>{pause}", "<!-- Silence -->",
 * a bare "...") in inconsistent wrappers. Reduced to letters only, those are
 * all just one of a few words, never real speech.
 */
function isJunkTranscript(text: string): boolean {
  const trimmed = text.trim();
  if (!/\w/.test(trimmed)) return true;
  const lettersOnly = trimmed
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(no speech( detected)?|silence|inaudible|no audio)( ?(pause|detected))?$/.test(
    lettersOnly,
  );
}

/**
 * The wake phrase is a greeting plus the name ("hey Aura", "hi Aura"). Two
 * words are much harder to hit by accident than one short word, which kept
 * colliding with an ordinary "or" or a mid-sentence mention. The name side
 * also accepts the mishearings actually seen from live transcription.
 * Returns the index right after the match (where the question starts).
 */
function matchWakePhrase(text: string, notetakerName: string): number | null {
  const names = Array.from(
    new Set(
      [
        notetakerName,
        "aura",
        "aur",
        "ora",
        "orah",
        "hora",
        "or",
        "aurang",
        "aurum",
      ].map((n) => n.toLowerCase()),
    ),
  );
  const namePattern = names
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(
    `\\b(hey|hi|hello|hay|ok|okay|que|qué|ke|k)[,.!]?\\s+(${namePattern})\\b[,.!?]?`,
    "i",
  );
  const m = text.match(re);
  return m && m.index != null ? m.index + m[0].length : null;
}

/** Speaks a line with the browser's voice and resolves when it's done (or after a safety timeout). */
function speakWithBrowser(text: string, rate = 1.03): Promise<void> {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    const done = () => resolve();
    utter.onend = done;
    utter.onerror = done;
    // Chrome occasionally never fires `end`; don't let that hang the flow.
    setTimeout(done, (text.split(/\s+/).length / 2.3) * 1000 + 2500);
    window.speechSynthesis.speak(utter);
  });
}

type AuraState = "idle" | "listening" | "thinking" | "speaking";

type TurnBuffer = {
  text: string;
  /** How much of `text` has already been committed as finished lines. */
  displayedLen: number;
  /** Recording-relative start of the still-open (uncommitted) part, or null if nothing is open. */
  segStartMs: number | null;
  lastDeltaAt: number;
  /** Wake-phrase search starts here, so a later "hey Aura" in the same turn is still found. */
  wakeScanFrom: number;
  /** Set once the wake phrase is heard: where the question text begins. */
  wakeQuestionStart: number | null;
};

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
  const [auraState, setAuraState] = useState<AuraState>("idle");
  const [showConsent, setShowConsent] = useState(prefs.announceConsent);
  const [notetakerNote, setNotetakerNote] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef(new RoomRecorder());
  const compositorRef = useRef<RoomCompositor | null>(null);
  const notetakerCtxRef = useRef<AudioContext | null>(null);
  const notetakerPlayerRef = useRef<PcmPlayer | null>(null);
  const voiceRef = useRef<NotetakerVoice | null>(null);
  const offscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const auraBusyRef = useRef(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The call's t=0. This is when the recording starts, not when the meeting
   * row is created. Everything between those two moments (token mint,
   * WebSocket connect, compositor setup) used to push every transcript line
   * several seconds ahead of the video.
   */
  const callStartRef = useRef<number>(0);
  const turnBufferRef = useRef<Map<string, TurnBuffer>>(new Map());
  // First voice heard on the mic is assumed to be the host; any additional
  // distinct diarized voice gets "Speaker 2", "Speaker 3".
  const speakerNamesRef = useRef<Map<string, string>>(new Map());

  const relMs = useCallback(
    () => Math.max(0, Date.now() - callStartRef.current),
    [],
  );

  const displayNameFor = useCallback(
    (label: string | undefined) => {
      const key = label ?? "default";
      const existing = speakerNamesRef.current.get(key);
      if (existing) return existing;
      const name =
        speakerNamesRef.current.size === 0
          ? prefs.ownerName
          : `Speaker ${speakerNamesRef.current.size + 1}`;
      speakerNamesRef.current.set(key, name);
      return name;
    },
    [prefs.ownerName],
  );

  // Retries a few times before giving up, and only then says so. A single
  // dropped POST used to lose that line forever with nothing shown.
  const persistSegment = useCallback(
    async (
      mid: string,
      speaker: string,
      text: string,
      startMs: number,
      endMs: number,
    ) => {
      if (!text.trim()) return;
      const body = JSON.stringify({
        speaker,
        startMs: Math.round(startMs),
        endMs: Math.round(Math.max(startMs, endMs)),
        text,
        isFinal: true,
      });
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`/api/meetings/${mid}/segments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (res.ok) return;
          console.error(
            `persistSegment attempt ${attempt} failed`,
            res.status,
            await res.text().catch(() => ""),
          );
        } catch (err) {
          console.error(`persistSegment attempt ${attempt} threw`, err);
        }
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
      toast.error(
        "Lost a line of transcript — the connection dropped and it couldn't be saved.",
      );
    },
    [],
  );

  /** Adds finished lines to the live panel and saves them, each with its own start time. */
  const commitLines = useCallback(
    (speaker: string, items: { text: string; startMs: number }[]) => {
      const clean = items.filter(
        (i) => i.text.trim() && !isJunkTranscript(i.text),
      );
      if (clean.length === 0) return;
      const endMs = relMs();
      setLines((prev) => [
        ...prev,
        ...clean.map((i) => ({
          id: crypto.randomUUID(),
          speaker,
          text: i.text.trim(),
          startMs: i.startMs,
          endMs,
          final: true,
        })),
      ]);
      const mid = meetingIdRef.current;
      if (mid)
        for (const i of clean)
          void persistSegment(mid, speaker, i.text.trim(), i.startMs, endMs);
    },
    [persistSegment, relMs],
  );

  // Stable handles to the live agent's controls for use inside callbacks
  // defined before the hook call below.
  const agentRef = useRef<{
    setSuppressed: (s: boolean) => void;
    notifyOfNotetakerAnswer: (name: string, answer: string) => void;
  } | null>(null);

  /**
   * Runs one full notetaker exchange. Priya's output stays suppressed for
   * the whole thing (she was already suppressed the moment the wake phrase
   * was heard) and is only released once the notetaker has actually
   * finished speaking.
   */
  const askNotetaker = useCallback(
    async (question: string) => {
      const mid = meetingIdRef.current;
      if (!mid) return;
      auraBusyRef.current = true;
      setAuraState("thinking");
      setNotetakerNote(null);

      // Speaks in the notetaker's own streamed voice (also recorded), and
      // only falls back to the browser's voice if that session is down.
      const say = async (text: string) => {
        await notetakerCtxRef.current?.resume();
        try {
          if (!voiceRef.current) throw new Error("voice_unavailable");
          await voiceRef.current.speak(text);
        } catch (err) {
          console.error(
            "notetaker voice unavailable, using browser speech",
            err,
          );
          await speakWithBrowser(text);
        }
      };

      const ackText =
        ACK_PHRASES[Math.floor(Math.random() * ACK_PHRASES.length)];
      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          speaker: prefs.notetakerName,
          text: ackText,
          startMs: relMs(),
          endMs: relMs(),
          final: true,
        },
      ]);
      const ackDone = say(ackText);

      let answer: string | null = null;
      try {
        const res = await fetch(`/api/meetings/${mid}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, atMs: relMs() }),
          signal: AbortSignal.timeout(IN_CALL_ASK_TIMEOUT_MS),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            `ask_failed_${res.status}_${body.error ?? "unknown"}`,
          );
        }
        const data = (await res.json()) as { answer: string; blocked: boolean };
        await ackDone;

        const startMs = relMs();
        setLines((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            speaker: prefs.notetakerName,
            text: data.answer,
            startMs,
            endMs: startMs,
            final: true,
          },
        ]);
        void persistSegment(
          mid,
          prefs.notetakerName,
          data.answer,
          startMs,
          startMs,
        );
        if (data.blocked)
          setNotetakerNote("Declined to answer — a guest is on this call.");
        if (!data.blocked) answer = data.answer;

        setAuraState("speaking");
        await say(data.answer);
      } catch (err) {
        console.error("notetaker ask failed", err);
        const timedOut =
          err instanceof DOMException && err.name === "TimeoutError";
        toast.error(
          timedOut
            ? "That answer took too long to prepare — try asking again."
            : "The notetaker couldn't answer that — try asking again.",
        );
      } finally {
        auraBusyRef.current = false;
        setAuraState("idle");
        agentRef.current?.setSuppressed(false);
        if (answer)
          agentRef.current?.notifyOfNotetakerAnswer(
            prefs.notetakerName,
            answer,
          );
      }
    },
    [persistSegment, prefs.notetakerName, relMs],
  );

  /** The question after the wake phrase is finished: ask it, or stand down if nothing was asked. */
  const finishWakeQuestion = useCallback(
    (entry: TurnBuffer) => {
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
      if (entry.wakeQuestionStart === null) return;
      const question = entry.text.slice(entry.wakeQuestionStart).trim();
      entry.wakeQuestionStart = null;
      entry.wakeScanFrom = entry.text.length;
      if (question.replace(/[^a-z0-9]/gi, "").length > 2) {
        void askNotetaker(question);
      } else {
        setAuraState("idle");
        agentRef.current?.setSuppressed(false);
      }
    },
    [askNotetaker],
  );

  const handleTranscript = useCallback(
    (e: LiveTranscriptEvent) => {
      const isYou = e.speaker === "You";
      const bufKey = isYou ? `you:${e.speakerLabel ?? "default"}` : "agent";
      const speakerName = isYou ? displayNameFor(e.speakerLabel) : AGENT_NAME;
      const buf = turnBufferRef.current;
      const nowWall = Date.now();
      // When this fragment is actually heard in the recording: your words a
      // beat before their transcription arrives, Priya's once the audio
      // already queued ahead of them has played.
      const heardAt = isYou
        ? Math.max(0, relMs() - INPUT_TRANSCRIPTION_LAG_MS)
        : relMs() + (e.leadMs ?? 0);

      const entry: TurnBuffer = buf.get(bufKey) ?? {
        text: "",
        displayedLen: 0,
        segStartMs: null,
        lastDeltaAt: nowWall,
        wakeScanFrom: 0,
        wakeQuestionStart: null,
      };
      const committed: { text: string; startMs: number }[] = [];

      // 1. A real pause since the last fragment closes the open segment.
      //    Punctuation alone isn't enough: live transcription of your side
      //    often has none, so everything you said would club together.
      const open = entry.text.slice(entry.displayedLen);
      if (
        buf.has(bufKey) &&
        nowWall - entry.lastDeltaAt > PAUSE_MS &&
        open.trim()
      ) {
        committed.push({ text: open, startMs: entry.segStartMs ?? heardAt });
        entry.displayedLen = entry.text.length;
        entry.segStartMs = null;
      }
      entry.lastDeltaAt = nowWall;

      // 2. Append. Fragments arrive with no guaranteed spacing between them.
      const needsSpace =
        entry.text.length > 0 &&
        !/\s$/.test(entry.text) &&
        !/^[\s.,!?;:]/.test(e.text);
      entry.text += (needsSpace ? " " : "") + e.text;
      if (entry.segStartMs === null && e.text.trim())
        entry.segStartMs = heardAt;

      // 3. Split finished sentences off the open segment as they complete.
      const pending = entry.text.slice(entry.displayedLen);
      const matches = [...pending.matchAll(/[^.!?]+[.!?]+(?:\s|$)/g)];
      if (matches.length > 0) {
        const segStart = entry.segStartMs ?? heardAt;
        for (const m of matches)
          committed.push({ text: m[0], startMs: segStart });
        const last = matches[matches.length - 1];
        entry.displayedLen += last.index! + last[0].length;
        entry.segStartMs = entry.text.slice(entry.displayedLen).trim()
          ? heardAt
          : null;
      }

      // 4. Wake phrase. The moment "hey Aura" is heard, Priya's output is
      //    cut and dropped at the source, before the rest of the question is
      //    even spoken. The question is asked once you stop talking.
      if (isYou) {
        if (entry.wakeQuestionStart === null && !auraBusyRef.current) {
          const idx = matchWakePhrase(
            entry.text.slice(entry.wakeScanFrom),
            prefs.notetakerName,
          );
          if (idx !== null) {
            entry.wakeQuestionStart = entry.wakeScanFrom + idx;
            agentRef.current?.setSuppressed(true);
            setAuraState("listening");
          }
        }
        if (entry.wakeQuestionStart !== null) {
          if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
          const questionSoFar = entry.text
            .slice(entry.wakeQuestionStart)
            .replace(/[^a-z0-9]/gi, "");
          wakeTimerRef.current = setTimeout(
            () => finishWakeQuestion(entry),
            questionSoFar.length > 2
              ? QUESTION_SILENCE_MS
              : QUESTION_START_WAIT_MS,
          );
        }
      }

      // 5. End of turn: flush what's left.
      if (e.final) {
        const tail = entry.text.slice(entry.displayedLen);
        if (tail.trim())
          committed.push({ text: tail, startMs: entry.segStartMs ?? heardAt });
        if (isYou && entry.wakeQuestionStart !== null)
          finishWakeQuestion(entry);
        buf.delete(bufKey);
      } else {
        buf.set(bufKey, entry);
      }

      commitLines(speakerName, committed);

      const liveId = `${bufKey}-live`;
      const liveText = e.final
        ? ""
        : entry.text.slice(entry.displayedLen).trim();
      setLines((prev) => {
        const without = prev.filter((l) => l.id !== liveId);
        if (!liveText || isJunkTranscript(liveText)) return without;
        return [
          ...without,
          {
            id: liveId,
            speaker: speakerName,
            text: liveText,
            startMs: entry.segStartMs ?? heardAt,
            endMs: relMs(),
            final: false,
          },
        ];
      });
    },
    [
      commitLines,
      displayNameFor,
      finishWakeQuestion,
      prefs.notetakerName,
      relMs,
    ],
  );

  const {
    status: agentStatus,
    start: startAgent,
    stop: stopAgent,
    setMuted: setAgentMuted,
    setSuppressed,
    getAgentAudioStream,
    getMicStream,
    notifyOfNotetakerAnswer,
  } = useLiveAgent({
    onSpeakingChange: setAgentSpeaking,
    // The SDK's message dispatch swallows exceptions thrown in here, which
    // would make any bug in this handler fail silently.
    onTranscript: (e) => {
      try {
        handleTranscript(e);
      } catch (err) {
        console.error("onTranscript handler threw", err, e);
        toast.error("Transcript handling hit an error — check the console.");
      }
    },
  });

  useEffect(() => {
    agentRef.current = { setSuppressed, notifyOfNotetakerAnswer };
  }, [setSuppressed, notifyOfNotetakerAnswer]);

  useEffect(() => {
    meetingIdRef.current = meetingId;
  }, [meetingId]);

  useEffect(() => {
    if (stage !== "live") return;
    const t = setInterval(
      () => setElapsedMs(Date.now() - callStartRef.current),
      500,
    );
    return () => clearInterval(t);
  }, [stage]);

  // The live view's <video> only mounts once stage becomes "live".
  useEffect(() => {
    if (stage === "live" && videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current;
    }
  }, [stage]);

  const auraLabel = {
    idle: "Listening",
    listening: "Listening to you…",
    thinking: "Checking past meetings…",
    speaking: "Speaking…",
  }[auraState];

  // Keeps the recorded canvas in sync with what's on screen.
  useEffect(() => {
    compositorRef.current?.update({
      muted,
      agentSpeaking,
      agentStatusLabel:
        agentStatus === "live"
          ? agentSpeaking
            ? "Speaking…"
            : "Listening"
          : agentStatus,
      notetakerActive: auraState !== "idle",
      notetakerLabel: auraLabel,
    });
  }, [muted, agentSpeaking, agentStatus, auraState, auraLabel]);

  const handleJoin = useCallback(
    async (stream: MediaStream) => {
      localStreamRef.current = stream;

      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Test meeting — ${new Date().toLocaleString()}`,
        }),
      });
      if (!res.ok) {
        toast.error(
          "Couldn't start the meeting — check the database is configured.",
        );
        return;
      }
      const { meeting } = (await res.json()) as { meeting: { id: string } };
      setMeetingId(meeting.id);
      meetingIdRef.current = meeting.id;
      // Provisional until the recorder starts below and becomes the real t=0.
      callStartRef.current = Date.now();

      const partsRes = await fetch(`/api/meetings/${meeting.id}/participants`);
      const { participants: existing } = (await partsRes.json()) as {
        participants: RoomParticipant[];
      };
      setParticipants(existing);

      // The notetaker's voice gets its own player, created up front so it
      // can be mixed into the recording alongside everyone else.
      const notetakerCtx = new AudioContext();
      notetakerCtxRef.current = notetakerCtx;
      notetakerPlayerRef.current = new PcmPlayer(notetakerCtx);
      voiceRef.current = new NotetakerVoice(notetakerPlayerRef.current);
      // Connected in the background now, so the first answer doesn't wait on it.
      voiceRef.current
        .warmUp()
        .catch((err) => console.error("notetaker voice warm-up failed", err));

      try {
        await startAgent();
      } catch {
        toast.error(
          "Live agent failed to connect — check GEMINI_API_KEY. The call continues without it.",
        );
      }

      // An offscreen <video> the compositor can draw from, independent of
      // when the on-screen preview mounts.
      const offscreen = document.createElement("video");
      offscreen.srcObject = stream;
      offscreen.muted = true;
      offscreen.playsInline = true;
      await offscreen.play().catch(() => {});
      offscreenVideoRef.current = offscreen;

      const compositor = new RoomCompositor(offscreen, {
        ownerName: prefs.ownerName,
        muted: false,
        agentName: AGENT_NAME,
        agentStatusLabel: "Connecting…",
        agentSpeaking: false,
        notetakerName: prefs.notetakerName,
        notetakerActive: false,
        notetakerLabel: "Listening",
      });
      compositor.start();
      compositorRef.current = compositor;

      recorderRef.current.start(compositor.captureStream(), [
        getMicStream() ?? stream,
        getAgentAudioStream(),
        notetakerPlayerRef.current.stream,
      ]);
      callStartRef.current = recorderRef.current.startedAt;
      setStage("live");
    },
    [
      startAgent,
      getMicStream,
      getAgentAudioStream,
      prefs.ownerName,
      prefs.notetakerName,
    ],
  );

  const handleAddGuest = useCallback(
    async (preset: (typeof GUEST_PRESETS)[number]) => {
      const mid = meetingIdRef.current;
      if (!mid) return;
      if (
        participants.some((participant) => participant.email === preset.email)
      ) {
        toast.info(`${preset.name} is already in this meeting.`);
        return;
      }
      const res = await fetch(`/api/meetings/${mid}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preset.name,
          email: preset.email,
          role: "guest",
        }),
      });
      const { participant } = (await res.json()) as {
        participant: RoomParticipant;
      };
      setParticipants((prev) => [...prev, participant]);
      toast.info(
        `${preset.name} joined — the notetaker will now guard internal info from them.`,
      );
    },
    [participants],
  );

  const handleHighlight = useCallback(async () => {
    const mid = meetingIdRef.current;
    if (!mid) return;
    const at = relMs();
    await fetch(`/api/meetings/${mid}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startMs: Math.max(0, at - 5000),
        endMs: at,
        createdDuringCall: true,
      }),
    });
    toast.success("Highlighted this moment");
  }, [relMs]);

  const handleEnd = useCallback(async () => {
    const mid = meetingIdRef.current;
    if (!mid) return;
    setStage("ending");
    stopAgent();
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);

    // Whatever is still open in a turn buffer is real transcript content.
    for (const [bufKey, entry] of turnBufferRef.current) {
      const remaining = entry.text.slice(entry.displayedLen);
      const speakerName =
        bufKey === "agent"
          ? AGENT_NAME
          : displayNameFor(bufKey.replace(/^you:/, ""));
      commitLines(speakerName, [
        { text: remaining, startMs: entry.segStartMs ?? relMs() },
      ]);
    }
    turnBufferRef.current.clear();

    const recording = await recorderRef.current.stop();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    compositorRef.current?.stop();
    offscreenVideoRef.current?.pause();
    offscreenVideoRef.current = null;
    voiceRef.current?.close();
    void notetakerCtxRef.current?.close();

    if (!recording) {
      toast.warning(
        "No recording was captured for this call — the transcript and summary are unaffected.",
      );
    } else {
      try {
        const blob = await upload(`recordings/${mid}.webm`, recording.blob, {
          access: "public",
          handleUploadUrl: `/api/meetings/${mid}/recording-upload`,
          multipart: true,
          clientPayload: JSON.stringify({ meetingId: mid }),
          contentType: recording.blob.type || "video/webm",
        });
        const res = await fetchWithRetry(`/api/meetings/${mid}/recording`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: blob.url,
            contentType: recording.blob.type || "video/webm",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.stored) {
          toast.warning(
            data.reason === "blob_not_configured"
              ? "Recording storage isn't configured — the call was still transcribed."
              : "Couldn't save the recording — the call was still transcribed.",
          );
        }
      } catch (err) {
        console.error("recording upload failed", err);
        toast.warning(
          "Couldn't upload the recording — the call was still transcribed.",
        );
      }
    }

    try {
      // The real call length is the recording's length. The server's own
      // clock (row creation to this request) also counts setup and the
      // upload, which made a 3 minute call show as 4.
      const res = await fetchWithRetry(`/api/meetings/${mid}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationSec: recording
            ? Math.max(1, Math.round(recording.durationMs / 1000))
            : undefined,
        }),
      });
      if (!res.ok)
        toast.error(
          "Processing this meeting failed — you can still view the raw transcript.",
        );
    } catch {
      toast.error(
        "Couldn't reach the server to finish processing — you can still view the raw transcript.",
      );
    }
    router.push(`/m/${mid}`);
  }, [router, stopAgent, commitLines, displayNameFor, relMs]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      setAgentMuted(next);
      localStreamRef.current
        ?.getAudioTracks()
        .forEach((t) => (t.enabled = !next));
      return next;
    });
  }, [setAgentMuted]);

  if (stage === "lobby") return <RoomLobby prefs={prefs} onJoin={handleJoin} />;

  const auraStyles = {
    idle: {
      border: "border-dashed border-primary/40",
      bg: "bg-primary-fixed/30",
      dot: "text-[#10B981]",
    },
    listening: {
      border: "border-solid border-[#D9A400]",
      bg: "bg-[#FFF8E7]",
      dot: "text-[#D9A400] animate-pulse",
    },
    thinking: {
      border: "border-solid border-primary",
      bg: "bg-primary-fixed/40",
      dot: "text-primary animate-pulse",
    },
    speaking: {
      border: "border-solid border-primary",
      bg: "bg-primary-fixed/60",
      dot: "text-primary animate-pulse",
    },
  }[auraState];

  return (
    <div className="flex h-dvh flex-col bg-background">
      {showConsent && (
        <div className="flex items-center justify-between gap-3 bg-accent-soft px-4 py-2 text-xs text-accent">
          <span className="flex items-center gap-2">
            <Circle className="h-2 w-2 animate-record fill-current" />
            This meeting is being recorded and transcribed. Everyone on this
            call has been notified.
          </span>
          <button
            onClick={() => setShowConsent(false)}
            className="font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
            <div className="relative min-h-[320px] overflow-hidden rounded-3xl bg-black shadow-lg lg:min-h-0">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-label-sm text-white backdrop-blur-sm">
                {prefs.ownerName} {muted && "(muted)"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 overflow-y-auto lg:flex lg:flex-col">
              {/* Real borders, not rings: a box-shadow ring gets clipped by this column's overflow. */}
              <div
                className={cn(
                  "relative flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-3xl border-2 bg-card p-4 text-center shadow-sm transition-colors",
                  agentSpeaking ? "border-accent" : "border-transparent",
                )}
              >
                <Avatar name={AGENT_NAME} size={56} />
                <span className="text-sm font-medium">{AGENT_NAME}</span>
                <span className="text-xs text-muted-foreground">
                  {agentStatus === "connecting" && "Connecting…"}
                  {agentStatus === "live" &&
                    (auraState !== "idle"
                      ? "Waiting"
                      : agentSpeaking
                        ? "Speaking…"
                        : "Listening")}
                  {agentStatus === "reconnecting" && "Reconnecting…"}
                  {agentStatus === "error" && "Unavailable"}
                </span>
              </div>

              <div
                className={cn(
                  "relative flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-3xl border-2 p-4 text-center shadow-sm transition-colors",
                  auraStyles.border,
                  auraStyles.bg,
                )}
              >
                <div className="brand-gradient flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm">
                  <Logomark className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium">
                  {prefs.notetakerName}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Circle
                    className={cn(
                      "h-2 w-2 shrink-0 fill-current",
                      auraStyles.dot,
                    )}
                  />
                  {auraLabel}
                </span>
                {auraState === "idle" && (
                  <span className="text-[11px] text-muted-foreground/80">
                    Say &ldquo;Hey {prefs.notetakerName}&rdquo; to ask
                  </span>
                )}
              </div>

              {participants
                .filter((participant) => participant.role === "guest")
                .map((participant) => (
                  <div
                    key={participant.id}
                    className="relative flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-transparent bg-card p-4 text-center shadow-sm"
                  >
                    <Avatar name={participant.name} size={56} />
                    <span className="text-sm font-medium">
                      {participant.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Circle className="h-2 w-2 shrink-0 fill-[#10B981] text-[#10B981]" />{" "}
                      Listening
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-sm">
              <Circle className="h-2.5 w-2.5 animate-record fill-[var(--destructive)] text-[var(--destructive)]" />
              <span className="font-mono tabular-nums">
                {formatTimecode(elapsedMs / 1000)}
              </span>
              <div className="ml-2 flex -space-x-2">
                {participants.map((p) => (
                  <Avatar
                    key={p.id}
                    name={p.name}
                    size={24}
                    className="ring-2 ring-card"
                  />
                ))}
              </div>
              {participants.some((p) => p.isExternal) && (
                <span className="ml-1 flex items-center gap-1 text-xs text-[var(--warning)]">
                  <ShieldAlert className="h-3.5 w-3.5" /> Guest present —
                  internal answers guarded
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={muted ? "destructive" : "secondary"}
                size="icon"
                onClick={toggleMute}
                title="Mute"
              >
                {muted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleHighlight}>
                <Bookmark className="h-4 w-4" /> Highlight
              </Button>
              <GuestMenu
                onAdd={handleAddGuest}
                addedEmails={participants
                  .filter((participant) => participant.role === "guest")
                  .map((participant) => participant.email)
                  .filter((email): email is string => Boolean(email))}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEnd}
                disabled={stage === "ending"}
              >
                {stage === "ending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="h-4 w-4" />
                )}
                End
              </Button>
            </div>
          </div>

          {notetakerNote && (
            <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] bg-accent-soft px-3 py-2 text-xs text-accent">
              <ShieldAlert className="h-3.5 w-3.5" />
              {notetakerNote}
            </div>
          )}
        </div>

        <div className="h-80 shrink-0 overflow-hidden rounded-3xl border border-border bg-card shadow-sm md:h-auto md:w-80">
          <TranscriptPanel
            lines={lines}
            notetakerName={prefs.notetakerName}
            ownerName={prefs.ownerName}
          />
        </div>
      </div>
    </div>
  );
}

function GuestMenu({
  onAdd,
  addedEmails,
}: {
  onAdd: (p: (typeof GUEST_PRESETS)[number]) => void;
  addedEmails: string[];
}) {
  const [open, setOpen] = useState(false);
  const availableGuests = GUEST_PRESETS.filter(
    (guest) => !addedEmails.includes(guest.email),
  );
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <UserPlus className="h-4 w-4" /> Add guest
      </Button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-56 rounded-[var(--radius-md)] border border-border bg-card p-1 shadow-lg">
          {availableGuests.length > 0 ? (
            availableGuests.map((g) => (
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
            ))
          ) : (
            <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
              All demo guests are already in the meeting.
            </p>
          )}
          <p className="px-2.5 pt-1 pb-0.5 text-[10px] text-muted-foreground">
            Simulates someone external joining, to test the guardrail.
          </p>
        </div>
      )}
    </div>
  );
}
