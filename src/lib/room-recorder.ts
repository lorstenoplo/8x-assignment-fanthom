"use client";

/**
 * Mixes the local camera video with BOTH audio sources — your mic and the
 * agent's synthesized voice — into one MediaStream, so the resulting
 * recording plays back as a normal two-person call rather than only your
 * side of it.
 */
export class RoomRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mixCtx: AudioContext | null = null;

  start(video: MediaStream, mic: MediaStream, agentAudio: MediaStream | null) {
    const mixCtx = new AudioContext();
    this.mixCtx = mixCtx;
    const dest = mixCtx.createMediaStreamDestination();

    if (mic.getAudioTracks().length > 0) {
      mixCtx.createMediaStreamSource(mic).connect(dest);
    }
    if (agentAudio && agentAudio.getAudioTracks().length > 0) {
      mixCtx.createMediaStreamSource(agentAudio).connect(dest);
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
  }

  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return this.finalize();
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(this.finalize());
      recorder.stop();
    });
  }

  private finalize(): Blob | null {
    void this.mixCtx?.close();
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: this.recorder?.mimeType || "video/webm" });
  }
}
