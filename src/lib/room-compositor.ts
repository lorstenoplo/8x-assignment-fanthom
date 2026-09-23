"use client";

export type CompositorState = {
  ownerName: string;
  muted: boolean;
  agentName: string;
  agentStatusLabel: string;
  agentSpeaking: boolean;
  notetakerName: string;
  notetakerActive: boolean;
  notetakerLabel: string;
};

/**
 * Draws the room's on-screen layout (your video + the AI participant tile +
 * the notetaker tile) onto an offscreen canvas every frame, so the saved
 * recording matches what was actually on screen during the call instead of
 * just the raw camera feed with everything else invisible.
 */
export class RoomCompositor {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private state: CompositorState;

  constructor(
    private videoEl: HTMLVideoElement,
    initialState: CompositorState,
  ) {
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext("2d")!;
    this.state = initialState;
  }

  update(patch: Partial<CompositorState>) {
    Object.assign(this.state, patch);
  }

  start() {
    const loop = () => {
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  captureStream(fps = 30): MediaStream {
    // captureStream is standard on canvas but missing from the lib.dom types
    // this project's TS target ships with.
    return (this.canvas as unknown as { captureStream(fps?: number): MediaStream }).captureStream(fps);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawTile(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { bg: string; ring: boolean; ringColor: string; label: string; sub: string; avatarBg: string; avatarFg: string; initial: string },
  ) {
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(x, y, w, h, 20);
    ctx.fillStyle = opts.bg;
    ctx.fill();
    if (opts.ring) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = opts.ringColor;
      this.roundRect(x + 2, y + 2, w - 4, h - 4, 18);
      ctx.stroke();
    }

    const cx = x + w / 2;
    const cy = y + h / 2 - 18;
    const r = Math.min(w, h) * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = opts.avatarBg;
    ctx.fill();
    ctx.fillStyle = opts.avatarFg;
    ctx.font = `${Math.round(r)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.initial, cx, cy + 2);

    ctx.fillStyle = "#1e1b26";
    ctx.font = "600 20px sans-serif";
    ctx.fillText(opts.label, cx, cy + r + 34);
    ctx.fillStyle = "#6b6475";
    ctx.font = "16px sans-serif";
    ctx.fillText(opts.sub, cx, cy + r + 60);
    ctx.restore();
  }

  private render() {
    const { ctx, canvas, videoEl, state } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#0b0b12";
    ctx.fillRect(0, 0, w, h);

    const gap = 14;
    const mainW = Math.round(w * 0.68);

    ctx.save();
    this.roundRect(0, 0, mainW, h, 20);
    ctx.clip();
    if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
      const scale = Math.max(mainW / videoEl.videoWidth, h / videoEl.videoHeight);
      const dw = videoEl.videoWidth * scale;
      const dh = videoEl.videoHeight * scale;
      ctx.drawImage(videoEl, (mainW - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, mainW, h);
    }
    ctx.restore();

    const tag = `${state.ownerName}${state.muted ? " (muted)" : ""}`;
    ctx.font = "16px sans-serif";
    const tagW = ctx.measureText(tag).width + 24;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    this.roundRect(16, h - 48, tagW, 32, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(tag, 28, h - 32);

    const sideX = mainW + gap;
    const sideW = w - sideX;
    const tileH = (h - gap) / 2;

    this.drawTile(sideX, 0, sideW, tileH, {
      bg: "#ffffff",
      ring: state.agentSpeaking,
      ringColor: "#a855f7",
      label: state.agentName,
      sub: state.agentStatusLabel,
      avatarBg: "#f9c9b0",
      avatarFg: "#7a3b1e",
      initial: state.agentName.slice(0, 1).toUpperCase(),
    });

    this.drawTile(sideX, tileH + gap, sideW, tileH, {
      bg: "#f2e9ff",
      ring: state.notetakerActive,
      ringColor: "#7c3aed",
      label: state.notetakerName,
      sub: state.notetakerLabel,
      avatarBg: "#7c3aed",
      avatarFg: "#ffffff",
      initial: state.notetakerName.slice(0, 1).toUpperCase(),
    });
  }
}
