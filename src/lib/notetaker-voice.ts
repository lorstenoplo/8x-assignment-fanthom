"use client";

import { GoogleGenAI, Modality, type Session } from "@google/genai";
import type { PcmPlayer } from "./audio-pcm";

/**
 * The notetaker's spoken voice: a Live session that reads text aloud as it
 * streams, played through `player` (which the room also mixes into the
 * recording). Opened once per call and reused; reopened lazily if it drops.
 */
export class NotetakerVoice {
  private session: Session | null = null;
  private connecting: Promise<void> | null = null;
  private onTurnDone: (() => void) | null = null;

  constructor(private player: PcmPlayer) {}

  private async connect() {
    const res = await fetch("/api/live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "notetaker-voice" }),
    });
    if (!res.ok) throw new Error(`voice_token_failed_${res.status}`);
    const { token, model } = (await res.json()) as { token: string; model: string };
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
    this.session = await ai.live.connect({
      model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (m) => {
          if (m.data) this.player.enqueue(m.data);
          if (m.serverContent?.turnComplete) this.finishTurn();
        },
        onclose: () => {
          this.session = null;
          this.finishTurn();
        },
        onerror: () => {},
      },
    });
  }

  private finishTurn() {
    const done = this.onTurnDone;
    this.onTurnDone = null;
    done?.();
  }

  /** Opens the session ahead of time so the first answer doesn't pay the connect cost. */
  async warmUp() {
    if (this.session) return;
    this.connecting ??= this.connect().finally(() => (this.connecting = null));
    await this.connecting;
  }

  /** Speaks `text` and resolves once it has finished playing. Throws if the voice can't connect. */
  async speak(text: string) {
    await this.warmUp();
    const session = this.session;
    if (!session) throw new Error("voice_unavailable");
    const generated = new Promise<void>((resolve) => {
      this.onTurnDone = resolve;
      // Generation normally ends well before this; it's only a backstop.
      setTimeout(resolve, 45_000);
    });
    session.sendClientContent({ turns: [text], turnComplete: true });
    await generated;
    await this.player.waitUntilDrained();
  }

  close() {
    try {
      this.session?.close();
    } catch {
      // already closed
    }
    this.session = null;
  }
}
