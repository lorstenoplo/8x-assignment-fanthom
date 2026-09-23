"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Video, VideoOff, Mic, MicOff, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logomark } from "@/components/logomark";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { RoomPrefs } from "./types";

export function RoomLobby({
  prefs,
  onJoin,
}: {
  prefs: RoomPrefs;
  onJoin: (stream: MediaStream) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const joiningRef = useRef(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
      })
      .catch(() => setError("Camera/mic access was denied. You can still join audio-only once you allow it."));
    return () => {
      active = false;
      // Leaving the lobby without joining (the back button) should release
      // the camera/mic — but not when unmounting *because* of a successful
      // join, since the live call keeps using this exact same stream.
      if (!joiningRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // The <video> element only exists once `stream` is set AND `camOn` is
  // true (conditional render below swaps it for an avatar placeholder when
  // the camera's toggled off) — so turning the camera back on remounts a
  // brand new <video> with no srcObject yet. Re-running this whenever camOn
  // flips, not just when the stream itself changes, is what makes the
  // preview come back instead of staying blank.
  useEffect(() => {
    if (stream && camOn && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, camOn]);

  function toggleCam() {
    stream?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn((v) => !v);
  }
  function toggleMic() {
    stream?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn((v) => !v);
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-10 p-6 lg:flex-row lg:gap-16 lg:p-12">
      <Link
        href="/calls"
        className="absolute left-6 top-6 flex items-center gap-1.5 text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Overview
      </Link>

      {/* Big preview, Meet-style — the main focus of the screen instead of a
          small tile squeezed next to a wall of text. The video canvas itself
          stays dark (every video-call UI does this, light-themed app or
          not); everything around it — background, text, buttons — matches
          the rest of Aura instead of switching the whole screen to a
          one-off dark mode nothing else in the app uses. */}
      <div className="relative w-full max-w-3xl">
        <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-[#151320] shadow-xl">
          {stream && camOn ? (
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          ) : stream ? (
            <div className="flex h-full items-center justify-center">
              <Avatar name={prefs.ownerName} size={96} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-white/60">
              {error ? <AlertTriangle className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
            </div>
          )}

          <span className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-label-sm text-white backdrop-blur-sm">
            {prefs.ownerName}
          </span>

          {stream && (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3">
              <button
                onClick={toggleMic}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors",
                  micOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-destructive text-destructive-foreground",
                )}
                aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                onClick={toggleCam}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors",
                  camOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-destructive text-destructive-foreground",
                )}
                aria-label={camOn ? "Turn off camera" : "Turn on camera"}
              >
                {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 text-on-surface">
          <Logomark className="h-6 w-6" />
          <span className="text-label-lg font-medium">Aura</span>
        </div>

        <div>
          <h1 className="text-headline-lg text-on-surface">Ready to start a test meeting?</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            An AI interviewer joins as the other participant and asks about a project — a real two-way call, real
            transcript, real recording.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-[color-mix(in srgb,var(--destructive) 12%,transparent)] p-3 text-body-sm text-[var(--destructive)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="space-y-3.5 rounded-xl bg-surface-container-lowest/80 p-5 text-body-sm text-on-surface-variant shadow-sm backdrop-blur-md">
          <p className="flex items-center gap-2.5">
            <Video className="h-4 w-4 shrink-0 text-primary" /> {prefs.autoRecord ? "Recording starts automatically." : "You'll be asked before recording starts."}
          </p>
          <p className="flex items-center gap-2.5">
            <Mic className="h-4 w-4 shrink-0 text-primary" /> Say &ldquo;Hey {prefs.notetakerName}&rdquo; then your question to ask the notetaker.
          </p>
          {prefs.announceConsent && (
            <p className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Everyone in the room will see a recording notice, per your consent settings.
            </p>
          )}
        </div>

        <Button
          size="lg"
          variant="solid"
          disabled={!stream || joining}
          onClick={() => {
            if (!stream) return;
            joiningRef.current = true;
            setJoining(true);
            onJoin(stream);
          }}
        >
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          Join test meeting
        </Button>
      </div>
    </div>
  );
}
