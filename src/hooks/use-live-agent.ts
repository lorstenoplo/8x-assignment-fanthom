"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { downsampleTo16k, floatTo16BitPCM, arrayBufferToBase64, PcmPlayer } from "@/lib/audio-pcm";

export type LiveTranscriptEvent = {
  speaker: "You" | "Agent";
  text: string;
  final: boolean;
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

    const ai = new GoogleGenAI({ apiKey: token });

    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        sessionResumption: resumeHandleRef.current ? { handle: resumeHandleRef.current } : {},
      },
      callbacks: {
        onopen: () => setStatus("live"),
        onmessage: (msg) => {
          if (stoppedRef.current) return;

          if (msg.serverContent?.interrupted) {
            playerRef.current?.clear();
          }

          const inT = msg.serverContent?.inputTranscription;
          if (inT?.text) onTranscriptRef.current({ speaker: "You", text: inT.text, final: !!inT.finished });

          const outT = msg.serverContent?.outputTranscription;
          if (outT?.text) onTranscriptRef.current({ speaker: "Agent", text: outT.text, final: !!outT.finished });

          const data = msg.data;
          if (data) playerRef.current?.enqueue(data);

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

  const reconnectSoon = useCallback(async () => {
    if (stoppedRef.current) return;
    setStatus("reconnecting");
    try {
      await connect();
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

  useEffect(() => () => stop(), [stop]);

  return {
    status,
    start,
    stop,
    setMuted,
    getAgentAudioStream: () => playerRef.current?.stream ?? null,
    getMicStream: () => micStreamRef.current,
  };
}
