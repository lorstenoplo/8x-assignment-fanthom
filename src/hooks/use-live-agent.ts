"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { downsampleTo16k, floatTo16BitPCM, arrayBufferToBase64, PcmPlayer } from "@/lib/audio-pcm";

export type LiveTranscriptEvent = {
  speaker: "You" | "Agent";
  /** Diarization label ("spk_1", "spk_2", ...) when the input side has more than one voice on the mic. Undefined for the agent (always one voice). */
  speakerLabel?: string;
  text: string;
  final: boolean;
  /** Agent only: ms of audio already queued ahead of this text, i.e. how long until it's actually heard. */
  leadMs?: number;
};

export type LiveAgentStatus = "idle" | "connecting" | "live" | "reconnecting" | "closed" | "error";

/**
 * Drives the "other participant" in the test room: a real audio-to-audio
 * Gemini Live session. The browser talks to Gemini directly over its own
 * WebSocket — this hook never sends audio through our server, only fetches a
 * short-lived ephemeral token from it first.
 */
export function useLiveAgent(opts: { onTranscript: (e: LiveTranscriptEvent) => void; onSpeakingChange?: (speaking: boolean) => void }) {
  const [status, setStatus] = useState<LiveAgentStatus>("idle");
  const sessionRef = useRef<Session | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const resumeHandleRef = useRef<string | undefined>(undefined);
  const mutedRef = useRef(false);
  const suppressedRef = useRef(false);
  const dropOutputRef = useRef(false);
  const agentTurnActiveRef = useRef(false);
  const stoppedRef = useRef(false);
  const speakingPollRef = useRef<number | undefined>(undefined);

  const onTranscriptRef = useRef(opts.onTranscript);
  onTranscriptRef.current = opts.onTranscript;

  const connect = useCallback(async () => {
    stoppedRef.current = false;
    setStatus((s) => (s === "live" ? s : "connecting"));

    const res = await fetch("/api/live-token", { method: "POST" });
    if (!res.ok) {
      setStatus("error");
      throw new Error("Could not get a Live API token. Is GEMINI_API_KEY configured?");
    }
    const { token, model } = (await res.json()) as { token: string; model: string };

    // Ephemeral tokens are v1alpha-only — omitting this makes the SDK's own
    // warning come true: the connect() call below fails immediately, which
    // (combined with the unconditional auto-reconnect on close) was looping
    // through a fresh token mint several times a second until the mint
    // endpoint's rate limit kicked in and the room never got past
    // "Connecting…".
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });

    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        sessionResumption: resumeHandleRef.current ? { handle: resumeHandleRef.current } : {},
      },
      callbacks: {
        onopen: () => {
          reconnectAttemptsRef.current = 0;
          setStatus("live");
        },
        onmessage: (msg) => {
          if (stoppedRef.current) return;

          if (msg.serverContent?.interrupted) {
            playerRef.current?.clear();
          }

          // Your speech is transcribed through this same session, so it
          // always flows — even while Priya's own output is being dropped.
          const inT = msg.serverContent?.inputTranscription;
          if (inT?.text)
            onTranscriptRef.current({ speaker: "You", speakerLabel: inT.speakerLabel, text: inT.text, final: !!inT.finished });

          const outT = msg.serverContent?.outputTranscription;
          const data = msg.data;
          if (outT?.text || data) agentTurnActiveRef.current = true;

          if (!dropOutputRef.current) {
            if (outT?.text) {
              // Her text arrives faster than her audio plays; stamp it with
              // how far ahead audio is queued, i.e. when it's actually heard.
              const leadMs = playerRef.current?.queuedLeadMs ?? 0;
              onTranscriptRef.current({ speaker: "Agent", text: outT.text, final: !!outT.finished, leadMs });
            }
            if (data) playerRef.current?.enqueue(data);
          }

          if (msg.serverContent?.turnComplete || msg.serverContent?.interrupted) {
            agentTurnActiveRef.current = false;
            // A reply that started while she was suppressed is dropped to
            // the end, never half-played once suppression lifts.
            if (!suppressedRef.current) dropOutputRef.current = false;
          }

          if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
            resumeHandleRef.current = msg.sessionResumptionUpdate.newHandle;
          }

          if (msg.goAway) {
            void reconnectSoon();
          }
        },
        onerror: () => setStatus("error"),
        onclose: () => {
          if (!stoppedRef.current) void reconnectSoon();
        },
      },
    });

    sessionRef.current = session;
  }, []);

  // A second line of defense against the failure mode above (or any other
  // repeated connect failure): back off and cap retries instead of hammering
  // the token-mint endpoint in a tight loop, which is rate-limited at 6
  // requests/5min specifically because starting a Live session is metered.
  const reconnectAttemptsRef = useRef(0);
  const reconnectSoon = useCallback(async () => {
    if (stoppedRef.current) return;
    if (reconnectAttemptsRef.current >= 4) {
      setStatus("error");
      return;
    }
    reconnectAttemptsRef.current += 1;
    setStatus("reconnecting");
    await new Promise((r) => setTimeout(r, 500 * 2 ** reconnectAttemptsRef.current));
    if (stoppedRef.current) return;
    try {
      await connect();
      reconnectAttemptsRef.current = 0;
    } catch {
      setStatus("error");
    }
  }, [connect]);

  const start = useCallback(async () => {
    stoppedRef.current = false;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    audioCtxRef.current = audioCtx;
    playerRef.current = new PcmPlayer(audioCtx);

    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    micStreamRef.current = mic;

    await connect();

    const source = audioCtx.createMediaStreamSource(mic);
    // ScriptProcessorNode is deprecated but universally supported; an
    // AudioWorklet would be the production choice, kept simple since this
    // room stands in for real meeting capture rather than being the product
    // surface itself.
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (e) => {
      if (mutedRef.current || stoppedRef.current || !sessionRef.current) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(input, audioCtx.sampleRate);
      const pcm = floatTo16BitPCM(down);
      const b64 = arrayBufferToBase64(pcm);
      try {
        sessionRef.current.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } });
      } catch {
        // socket mid-reconnect; drop this chunk
      }
    };
    source.connect(processor);
    // Route through a silent gain node rather than ctx.destination, so we
    // don't hear our own mic looped back.
    const silence = audioCtx.createGain();
    silence.gain.value = 0;
    processor.connect(silence);
    silence.connect(audioCtx.destination);

    speakingPollRef.current = window.setInterval(() => {
      opts.onSpeakingChange?.(!!playerRef.current?.isSpeaking);
    }, 150);
  }, [connect, opts]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    window.clearInterval(speakingPollRef.current);
    try {
      sessionRef.current?.close();
    } catch {
      // ignore
    }
    processorRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    setStatus("closed");
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
  }, []);

  // Priya's audio session only ever receives the mic — the notetaker's
  // synthesized voice plays back through the browser's speakers to the
  // human, not into her input stream, so without this she has no way to
  // know the notetaker said anything at all. `sendClientContent` injects it
  // as a text turn into her ongoing conversation (not spoken audio, but
  // real context she'll respond to), the closest equivalent to "a person on
  // the call who just heard the notetaker answer out loud."
  const notifyOfNotetakerAnswer = useCallback((notetakerName: string, answer: string) => {
    try {
      sessionRef.current?.sendClientContent({
        turns: [
          `[The user was just talking to the meeting notetaker, ${notetakerName}, not to you — anything you said in reply to that was not heard by anyone. The notetaker answered out loud: "${answer}". Everyone on the call heard it. Briefly and naturally acknowledge it only if it's actually relevant, then continue the conversation. Don't repeat the user's question or the notetaker's answer back.]`,
        ],
        turnComplete: true,
      });
    } catch {
      // socket mid-reconnect — the acknowledgment is a nicety, not worth retrying
    }
  }, []);

  // While the notetaker has the floor, Priya's output is thrown away at the
  // source: no audio is played and no transcript is emitted, including any
  // reply she had already started. A persona instruction can't do this. It
  // only shapes what she says, not whether a turn gets generated and played.
  // Her input is NOT muted, since your speech is transcribed through her
  // session and muting it would drop the question itself.
  const setSuppressed = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed;
    if (suppressed) {
      dropOutputRef.current = true;
      playerRef.current?.clear();
    } else if (!agentTurnActiveRef.current) {
      dropOutputRef.current = false;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    status,
    start,
    stop,
    setMuted,
    setSuppressed,
    notifyOfNotetakerAnswer,
    getAgentAudioStream: () => playerRef.current?.stream ?? null,
    getMicStream: () => micStreamRef.current,
  };
}
