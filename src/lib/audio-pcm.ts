"use client";

/**
 * Live API wants 16-bit PCM mono @16kHz on the way in, and sends 16-bit PCM
 * mono @24kHz back. Both directions need conversion from/to the browser's
 * native Float32 samples — done here with plain DSP, no extra dependency.
 */

export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    out[i] = input[Math.floor(i * ratio)];
  }
  return out;
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Plays a stream of 24kHz PCM16 chunks back-to-back with no gaps, by
 * scheduling each buffer to start exactly when the previous one ends. Also
 * exposes its output as a MediaStream node so the room can mix the agent's
 * voice into the local recording.
 */
export class PcmPlayer {
  private ctx: AudioContext;
  private nextStartTime = 0;
  private destination: MediaStreamAudioDestinationNode;
  private activeSources = new Set<AudioBufferSourceNode>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.destination = ctx.createMediaStreamDestination();
  }

  /** Tap for recording: every chunk is also routed here as it's scheduled for playback. */
  get stream() {
    return this.destination.stream;
  }

  enqueue(base64Pcm24k: string) {
    const int16 = base64ToInt16(base64Pcm24k);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    const buffer = this.ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    source.connect(this.ctx.destination);

    const startAt = Math.max(this.ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);
  }

  /** Called on interruption: stop whatever's queued so the agent can respond immediately. */
  clear() {
    for (const s of this.activeSources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    this.nextStartTime = this.ctx.currentTime;
  }

  get isSpeaking() {
    return this.activeSources.size > 0;
  }
}
