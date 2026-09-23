"use client";

import { useEffect, useRef, useState } from "react";
import { Video, Mic, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
      })
      .catch(() => setError("Camera/mic access was denied. You can still join audio-only once you allow it."));
    return () => {
      active = false;
    };
  }, []);

  // The <video> element only exists once `stream` is set (conditional
  // render below), so attaching srcObject inside the getUserMedia callback
  // above was a no-op — the ref was still null at that point. Doing it here,
  // keyed on `stream`, runs after the element has actually mounted.
  useEffect(() => {
    if (stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="grid w-full max-w-3xl items-start gap-6 md:grid-cols-2">
        <Card className="overflow-hidden !bg-black">
          <div className="relative aspect-video">
            {stream ? (
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {error ? <AlertTriangle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-col justify-center gap-4">
          <div>
            <h1 className="text-lg font-semibold">Ready to start a test meeting?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              An AI interviewer joins as the other participant and asks about a project — a real two-way call, real
              transcript, real recording.
            </p>
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[color-mix(in srgb,var(--destructive) 10%,transparent)] p-2.5 text-xs text-[var(--destructive)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <Video className="h-3.5 w-3.5 text-accent" /> {prefs.autoRecord ? "Recording starts automatically." : "You'll be asked before recording starts."}
            </p>
            <p className="flex items-center gap-2">
              <Mic className="h-3.5 w-3.5 text-accent" /> Say &ldquo;{prefs.notetakerName}&rdquo; any time to ask the notetaker a question.
            </p>
            {prefs.announceConsent && (
              <p className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Everyone in the room will see a recording notice, per your consent settings.
              </p>
            )}
          </div>

          <Button
            size="lg"
            variant="solid"
            disabled={!stream || joining}
            onClick={() => {
              if (!stream) return;
              setJoining(true);
              onJoin(stream);
            }}
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Join test meeting
          </Button>
        </div>
      </div>
    </div>
  );
}
