"use client";

import fixWebmDuration from "fix-webm-duration";

/**
 * Mixes the room's video (a composited canvas of every tile) with every
 * audio source — your mic, Priya's voice, and the notetaker's voice — into
 * one recording, so it plays back as the whole call rather than one side.
 *
 * `startedAt` is the recording's t=0. The transcript's timestamps are taken
 * relative to this exact moment so that seeking to a line in the transcript
 * lands on the same moment in the video.
 */
export class RoomRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mixCtx: AudioContext | null = null;
  startedAt = 0;

  start(video: MediaStream, audioSources: (MediaStream | null)[]) {
    const mixCtx = new AudioContext();
    this.mixCtx = mixCtx;
    const dest = mixCtx.createMediaStreamDestination();
    for (const src of audioSources) {
      if (src && src.getAudioTracks().length > 0) mixCtx.createMediaStreamSource(src).connect(dest);
    }

    const combined = new MediaStream([...video.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );

    this.chunks = [];
    this.recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.startedAt = Date.now();
  }

  /** Stops and returns the recording plus its real length in ms. */
  async stop(): Promise<{ blob: Blob; durationMs: number } | null> {
    const recorder = this.recorder;
    const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    void this.mixCtx?.close();
    if (this.chunks.length === 0) return null;

    const raw = new Blob(this.chunks, { type: this.recorder?.mimeType || "video/webm" });
    // MediaRecorder never writes a duration into the .webm header, so
    // browsers report Infinity until the whole file is scanned: the
    // scrubber is useless and seeking lands in the wrong place. Writing
    // the known duration into the header fixes playback for every player.
    const blob = await fixWebmDuration(raw, durationMs, { logger: false }).catch(() => raw);
    return { blob, durationMs };
  }
}
